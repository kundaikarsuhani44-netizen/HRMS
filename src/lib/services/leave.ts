import { sql, RuleError, friendlyDbError, type Tx } from '../db';
import { diffDays, fmtDate, isValidISODate, monthBounds, todayIST, type ISODate } from '../ist';
import { accrued, applicable, available, carryForward, splitForBalance, type LeaveTypeRule } from '../rules/accrual';
import { countLeaveDays } from '../rules/calendar';
import { AccessDenied, canApproveFor, loadActorById, requireManagerOrHr, requireHr, teamMemberIds, type Actor } from './actor';
import { getLocationCalendar } from './calendar';
import { appUrl, sendEmail } from './email';

export interface LeaveType extends LeaveTypeRule { id: number; name: string; is_active: boolean; sort_order: number }

export const MAX_BACKDATE_DAYS = 30;

export async function leaveTypes(opts: { activeOnly?: boolean } = {}) {
  return sql<LeaveType[]>`select * from leave_types ${opts.activeOnly ? sql`where is_active` : sql``} order by sort_order, id`;
}

export function eligible(t: Pick<LeaveType, 'eligible_gender'>, gender: string) {
  return !t.eligible_gender || t.eligible_gender === gender;
}

// ------------------------------------------------------------------ L2 — balances

export interface Balance {
  leave_type_id: number; code: string; name: string; unlimited: boolean; half_day_allowed: boolean;
  opening: number; accrued: number; adjustment: number; used: number; pending: number;
  available: number;  // opening + accrued + adjustment − used  (changes only on approval)
  applicable: number; // available − pending                    (what a new request may use)
  carry_forward_max: number;
}

/** Balance per leave type for one employee and leave year, calculated from source rows every time. */
export async function getBalances(employeeId: number, year: number = Number(todayIST().slice(0, 4)), asOf: ISODate = todayIST(), db: Tx = sql): Promise<Balance[]> {
  const [emp] = await db<{ gender: string; date_of_joining: ISODate; last_working_day: ISODate | null }[]>`
    select gender, date_of_joining, last_working_day from employees where id = ${employeeId}`;
  if (!emp) throw new RuleError('Employee not found.');
  const types = (await db<LeaveType[]>`select * from leave_types where is_active order by sort_order, id`).filter((t) => eligible(t, emp.gender));
  const stored = await db<{ leave_type_id: number; opening: number; adjustment: number }[]>`
    select leave_type_id, opening, adjustment from leave_balances where employee_id = ${employeeId} and year = ${year}`;
  const sums = await db<{ leave_type_id: number; status: string; paid: number }[]>`
    select leave_type_id, status, sum(days - lop_days)::numeric as paid
      from leave_requests where employee_id = ${employeeId} and extract(year from from_date) = ${year}
       and status in ('approved','pending') group by leave_type_id, status`;
  // For "as of" inside the year use asOf; for a past year, the year end.
  const asOfInYear = asOf.slice(0, 4) === String(year) ? asOf : asOf > `${year}-12-31` ? `${year}-12-31` : `${year}-01-01`;
  return types.map((t) => {
    const s = stored.find((x) => x.leave_type_id === t.id);
    const used = sums.find((x) => x.leave_type_id === t.id && x.status === 'approved')?.paid ?? 0;
    const pending = sums.find((x) => x.leave_type_id === t.id && x.status === 'pending')?.paid ?? 0;
    const parts = {
      opening: s?.opening ?? 0,
      accrued: accrued(t, emp, year, asOfInYear),
      adjustment: s?.adjustment ?? 0,
      used: Number(used), pending: Number(pending),
    };
    // LOP has no balance; report what has been taken.
    const unlimited = t.annual_quota === null || t.accrual_method === 'none';
    return {
      leave_type_id: t.id, code: t.code, name: t.name, unlimited, half_day_allowed: t.half_day_allowed,
      ...parts, available: unlimited ? Infinity : available(parts), applicable: unlimited ? Infinity : applicable(parts),
      carry_forward_max: t.carry_forward_max,
    };
  });
}

// ------------------------------------------------------------------ L3 — preview & apply

export interface ApplyInput {
  leave_type_id: number; from_date: ISODate; to_date: ISODate; is_half_day: boolean; reason: string;
  convert_excess_to_lop?: boolean; has_certificate?: boolean;
}

export interface Preview {
  ok: boolean;
  errors: string[];
  type?: LeaveType;
  days: number;
  dates: { date: ISODate; amount: number }[];
  excluded: { date: ISODate; why: string }[];
  balance?: Balance;
  /** Set when days exceed the usable balance: how the request would be split. */
  lopOffer?: { paid: number; lop: number };
  needsCertificate: boolean;
  paid: number; lop: number;
}

/**
 * Everything the apply form (and the agent) shows before submit: working-day count for the
 * employee's location, exclusions, balance, LOP split, certificate requirement, rule errors.
 */
export async function previewLeave(employee: Pick<Actor, 'id' | 'gender' | 'location_id' | 'date_of_joining' | 'last_working_day'>, input: ApplyInput, opts: { excludeRequestId?: number; today?: ISODate } = {}): Promise<Preview> {
  const today = opts.today ?? todayIST();
  const p: Preview = { ok: false, errors: [], days: 0, dates: [], excluded: [], needsCertificate: false, paid: 0, lop: 0 };
  const [type] = await sql<LeaveType[]>`select * from leave_types where id = ${input.leave_type_id} and is_active`;
  if (!type) { p.errors.push('Choose a leave type.'); return p; }
  p.type = type;
  if (!eligible(type, employee.gender)) p.errors.push(`${type.name} is not applicable to you.`);
  if (!isValidISODate(input.from_date) || !isValidISODate(input.to_date)) { p.errors.push('Choose valid dates.'); return p; }
  if (input.to_date < input.from_date) { p.errors.push('“To” date cannot be before “From” date.'); return p; }
  if (input.from_date.slice(0, 4) !== input.to_date.slice(0, 4)) p.errors.push('A request must stay inside one leave year (Jan–Dec). Split it into two requests.');
  if (diffDays(input.from_date, today) > MAX_BACKDATE_DAYS) p.errors.push(`Leave cannot be applied more than ${MAX_BACKDATE_DAYS} days in the past.`);
  if (input.from_date < employee.date_of_joining) p.errors.push('Leave cannot start before your date of joining.');
  if (employee.last_working_day && input.to_date > employee.last_working_day) p.errors.push('Leave cannot extend past your last working day.');
  if (input.is_half_day && !type.half_day_allowed) p.errors.push(`${type.name} cannot be taken as a half day.`);
  if (input.is_half_day && input.from_date !== input.to_date) p.errors.push('A half day must be a single date.');

  const cal = await getLocationCalendar(employee.location_id, `${input.from_date.slice(0, 4)}-01-01`, `${input.to_date.slice(0, 4)}-12-31`);
  const count = countLeaveDays(input.from_date, input.to_date, cal, { isHalfDay: input.is_half_day, calendarDays: type.counts_calendar_days });
  p.days = count.days; p.dates = count.dates; p.excluded = count.excluded;
  if (p.days === 0) p.errors.push('These dates are all weekly offs or holidays for your location — no leave is needed.');

  // Overlap with an existing live request (also enforced by an exclusion constraint)
  const [overlap] = await sql<{ id: number; from_date: ISODate; to_date: ISODate; status: string }[]>`
    select id, from_date, to_date, status from leave_requests
     where employee_id = ${employee.id} and status in ('pending','approved')
       and from_date <= ${input.to_date} and to_date >= ${input.from_date}
       ${opts.excludeRequestId ? sql`and id <> ${opts.excludeRequestId}` : sql``} limit 1`;
  if (overlap) p.errors.push(`You already have a ${overlap.status} request for ${fmtDate(overlap.from_date)} – ${fmtDate(overlap.to_date)}.`);

  // SL of more than N consecutive days requires a medical certificate
  if (type.certificate_after_days !== null && p.days > Number(type.certificate_after_days)) p.needsCertificate = true;

  const balances = await getBalances(employee.id, Number(input.from_date.slice(0, 4)), today);
  p.balance = balances.find((b) => b.leave_type_id === type.id);
  if (p.balance && !p.balance.unlimited && p.days > 0) {
    if (p.days > p.balance.applicable) {
      p.lopOffer = splitForBalance(p.days, p.balance.applicable, type.half_day_allowed);
      if (input.convert_excess_to_lop) { p.paid = p.lopOffer.paid; p.lop = p.lopOffer.lop; }
      else p.errors.push(`Insufficient ${type.code} balance: you can use ${fmt(p.balance.applicable)} day(s) but asked for ${fmt(p.days)}. Convert the excess ${fmt(p.lopOffer.lop)} day(s) to Loss of Pay?`);
    } else { p.paid = p.days; }
  } else if (type.code === 'LOP') { p.lop = p.days; }
  else p.paid = p.days;

  if (!input.reason || input.reason.trim().length < 3) p.errors.push('Give a short reason.');
  p.ok = p.errors.length === 0;
  return p;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

/** L3 — submit. Re-runs every rule on the server; the browser preview is only a convenience. */
export async function applyLeave(actor: Actor, input: ApplyInput, attachment?: { name: string; type: string; bytes: Buffer }, via: 'form' | 'agent' = 'form') {
  const p = await previewLeave(actor, input);
  if (!p.ok) throw new RuleError(p.errors[0]);
  if (p.needsCertificate && !attachment) throw new RuleError(`${p.type!.name} of more than ${Number(p.type!.certificate_after_days)} days needs a medical certificate. Upload it to submit.`);
  if (attachment) validateAttachment(attachment);
  let id: number;
  try {
    id = await sql.begin(async (tx) => {
      const [r] = await tx<{ id: number }[]>`
        insert into leave_requests (employee_id, leave_type_id, from_date, to_date, is_half_day, days, lop_days, reason, status, created_via, submitted_at)
        values (${actor.id}, ${input.leave_type_id}, ${input.from_date}, ${input.to_date}, ${input.is_half_day}, ${p.days}, ${p.lop && p.type!.code !== 'LOP' ? p.lop : 0},
                ${input.reason.trim()}, 'pending', ${via}, now())
        returning id`;
      if (attachment) {
        await tx`insert into leave_attachments (leave_request_id, file_name, mime_type, size_bytes, content)
                 values (${r.id}, ${attachment.name.slice(0, 120)}, ${attachment.type}, ${attachment.bytes.length}, ${attachment.bytes})`;
      }
      return r.id;
    });
  } catch (e) {
    throw new RuleError(friendlyDbError(e));
  }
  await notifyApprover(actor, id, p);
  return id;
}

export function validateAttachment(a: { name: string; type: string; bytes: Buffer }) {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(a.type)) throw new RuleError('Certificate must be a PDF, JPG or PNG.');
  if (a.bytes.length > 2 * 1024 * 1024) throw new RuleError('Certificate must be 2 MB or smaller.');
  if (a.bytes.length === 0) throw new RuleError('The certificate file is empty.');
}

async function notifyApprover(actor: Actor, requestId: number, p: Preview) {
  const approverId = actor.reporting_manager_id;
  const approver = approverId ? await loadActorById(approverId) : null;
  const hr = !approver ? (await sql<{ email: string }[]>`select email from employees where is_hr_admin and id <> ${actor.id} and (last_working_day is null or last_working_day >= ${todayIST()}::date) limit 1`)[0] : null;
  const to = approver?.email ?? hr?.email;
  if (!to) return;
  const span = p.dates.length ? `${fmtDate(p.dates[0].date)} – ${fmtDate(p.dates[p.dates.length - 1].date)}` : '';
  await sendEmail({
    to,
    subject: `Leave request: ${actor.full_name} — ${p.type!.code}, ${fmt(p.days)} day(s)`,
    text: `${actor.full_name} (${actor.employee_code}) has applied for ${p.type!.name}.\n\nDates: ${span}\nWorking days: ${fmt(p.days)}${p.lop ? ` (of which ${fmt(p.lop)} as Loss of Pay)` : ''}\n\nReview it in Kinara HR: ${appUrl('/approvals')}`,
    related: `leave_request:${requestId}`, createdBy: actor.id,
  });
}

// ------------------------------------------------------------------ drafts (agent)

/** The agent's only write: a draft that does nothing until the user presses Confirm. */
export async function createDraft(actor: Actor, input: ApplyInput) {
  const p = await previewLeave(actor, { ...input, reason: input.reason || 'Leave' });
  const blocking = p.errors.filter((e) => !e.startsWith('Insufficient'));
  if (blocking.length) return { ok: false as const, errors: blocking, preview: p };
  if (p.lopOffer && !input.convert_excess_to_lop) return { ok: false as const, errors: p.errors, preview: p, lopOffer: p.lopOffer };
  // drafts are cleared after a day; one person can have a handful
  await sql`delete from leave_requests where employee_id = ${actor.id} and status = 'draft' and created_at < now() - interval '1 day'`;
  const [r] = await sql<{ id: number }[]>`
    insert into leave_requests (employee_id, leave_type_id, from_date, to_date, is_half_day, days, lop_days, reason, status, created_via)
    values (${actor.id}, ${input.leave_type_id}, ${input.from_date}, ${input.to_date}, ${input.is_half_day}, ${p.days},
            ${p.lop && p.type!.code !== 'LOP' ? p.lop : 0}, ${(input.reason || 'Leave').trim()}, 'draft', 'agent')
    returning id`;
  return { ok: true as const, draftId: r.id, preview: p };
}

/** User clicked Confirm on a draft: all rules are checked again, then it becomes a normal pending request. */
export async function confirmDraft(actor: Actor, draftId: number) {
  const [d] = await sql`select * from leave_requests where id = ${draftId} and employee_id = ${actor.id} and status = 'draft'`;
  if (!d) throw new RuleError('This draft no longer exists or is not yours.');
  const input: ApplyInput = { leave_type_id: d.leave_type_id, from_date: d.from_date, to_date: d.to_date, is_half_day: d.is_half_day, reason: d.reason, convert_excess_to_lop: Number(d.lop_days) > 0 };
  const p = await previewLeave(actor, input, { excludeRequestId: draftId });
  if (!p.ok) throw new RuleError(p.errors[0]);
  if (p.needsCertificate) throw new RuleError('This leave needs a medical certificate — please submit it from the Apply Leave page.');
  try {
    await sql`update leave_requests set status = 'pending', days = ${p.days}, lop_days = ${p.lop && p.type!.code !== 'LOP' ? p.lop : 0}, submitted_at = now() where id = ${draftId}`;
  } catch (e) { throw new RuleError(friendlyDbError(e)); }
  await notifyApprover(actor, draftId, p);
  return draftId;
}

export async function discardDraft(actor: Actor, draftId: number) {
  await sql`delete from leave_requests where id = ${draftId} and employee_id = ${actor.id} and status = 'draft'`;
}

// ------------------------------------------------------------------ L4 / L5 — decide & cancel

export interface LeaveRequestRow {
  id: number; employee_id: number; employee_name: string; employee_code: string; location_name: string;
  leave_type_id: number; code: string; type_name: string; from_date: ISODate; to_date: ISODate; is_half_day: boolean;
  days: number; lop_days: number; reason: string; status: string; approver_name: string | null; approver_comment: string | null;
  created_at: Date; submitted_at: Date | null; decided_at: Date | null; has_attachment: boolean; created_via: string;
}

const requestSelect = sql`
  select r.id, r.employee_id, e.full_name as employee_name, e.employee_code, l.short_name as location_name,
         r.leave_type_id, t.code, t.name as type_name, r.from_date, r.to_date, r.is_half_day, r.days, r.lop_days,
         r.reason, r.status, ap.full_name as approver_name, r.approver_comment, r.created_at, r.submitted_at, r.decided_at,
         exists (select 1 from leave_attachments a where a.leave_request_id = r.id) as has_attachment, r.created_via
    from leave_requests r
    join employees e on e.id = r.employee_id
    join locations l on l.id = e.location_id
    join leave_types t on t.id = r.leave_type_id
    left join employees ap on ap.id = r.approver_id`;

export async function myRequests(actor: Actor, limit = 50) {
  return sql<LeaveRequestRow[]>`${requestSelect} where r.employee_id = ${actor.id} and r.status <> 'draft' order by r.from_date desc limit ${limit}`;
}
export async function getRequest(id: number) {
  const [r] = await sql<LeaveRequestRow[]>`${requestSelect} where r.id = ${id}`;
  return r ?? null;
}

/** L4 — approve / reject with a comment. Balance changes only here (approved rows count as "used"). */
export async function decideLeave(actor: Actor, id: number, approve: boolean, comment: string) {
  const result = await sql.begin(async (tx) => {
    const [r] = await tx`select * from leave_requests where id = ${id} for update`;
    if (!r) throw new RuleError('Request not found.');
    if (r.employee_id === actor.id) throw new AccessDenied('You cannot approve or reject your own leave.');
    if (!(await canApproveFor(actor, r.employee_id))) throw new AccessDenied('You can only decide leave for your direct reports.');
    if (r.status !== 'pending') throw new RuleError(`This request is already ${r.status}.`);
    if (!approve && (!comment || comment.trim().length < 3)) throw new RuleError('Add a comment explaining the rejection.');
    if (approve) {
      // re-check the balance at the moment of approval (it may have changed since the request)
      const balances = await getBalances(r.employee_id, Number(String(r.from_date).slice(0, 4)), todayIST(), tx);
      const b = balances.find((x) => x.leave_type_id === r.leave_type_id);
      const paid = Number(r.days) - Number(r.lop_days);
      if (b && !b.unlimited && paid > b.available + 1e-9) {
        throw new RuleError(`Cannot approve: ${b.code} available is ${b.available}, this request needs ${paid}. Ask the employee to re-apply with the excess as LOP.`);
      }
    }
    await tx`update leave_requests set status = ${approve ? 'approved' : 'rejected'}, approver_id = ${actor.id},
               approver_comment = ${comment?.trim() || null}, decided_at = now() where id = ${id}`;
    return r;
  });
  const req = (await getRequest(id))!;
  const [emp] = await sql<{ email: string }[]>`select email from employees where id = ${result.employee_id}`;
  await sendEmail({
    to: emp.email,
    subject: `Your ${req.code} leave (${fmtDate(req.from_date)}) was ${approve ? 'approved' : 'rejected'}`,
    text: `Hi ${req.employee_name},\n\n${actor.full_name} ${approve ? 'approved' : 'rejected'} your ${req.type_name} for ${fmtDate(req.from_date)} – ${fmtDate(req.to_date)} (${fmt(Number(req.days))} day(s)).\n${comment ? `\nComment: ${comment}\n` : ''}\nSee your balance: ${appUrl('/leave')}`,
    related: `leave_request:${id}`, createdBy: actor.id,
  });
}

/** L5 — cancel a pending request, or an approved one that has not started. The balance restores itself. */
export async function cancelLeave(actor: Actor, id: number) {
  const today = todayIST();
  const r = await sql.begin(async (tx) => {
    const [r] = await tx`select * from leave_requests where id = ${id} for update`;
    if (!r || r.employee_id !== actor.id) throw new AccessDenied('You can only cancel your own leave.');
    if (r.status === 'pending') { /* ok */ }
    else if (r.status === 'approved') {
      if (r.from_date <= today) throw new RuleError('Approved leave that has already started cannot be cancelled. Contact HR.');
    } else throw new RuleError(`A ${r.status} request cannot be cancelled.`);
    await tx`update leave_requests set status = 'cancelled', decided_at = now() where id = ${id}`;
    return r;
  });
  if (r.status === 'approved' && actor.reporting_manager_id) {
    const m = await loadActorById(actor.reporting_manager_id);
    if (m) await sendEmail({ to: m.email, subject: `${actor.full_name} cancelled approved leave (${fmtDate(r.from_date)})`, text: `${actor.full_name} cancelled their approved leave for ${fmtDate(r.from_date)} – ${fmtDate(r.to_date)}.`, related: `leave_request:${id}`, createdBy: actor.id });
  }
}

// ------------------------------------------------------------------ approvals inbox & L7 calendar

export interface PendingWithContext extends LeaveRequestRow { balance: Balance | undefined; clashes: { name: string; from_date: ISODate; to_date: ISODate; status: string }[] }

/** Pending leave I can decide, with the requester's balance and team clashes. */
export async function pendingForApprover(actor: Actor): Promise<PendingWithContext[]> {
  if (!actor.is_hr_admin && !actor.is_manager) return [];
  const rows = await sql<(LeaveRequestRow & { reporting_manager_id: number | null })[]>`
    ${requestSelect}
    where r.status = 'pending' and r.employee_id <> ${actor.id}
      ${actor.is_hr_admin ? sql`` : sql`and e.reporting_manager_id = ${actor.id}`}
    order by r.from_date`;
  const out: PendingWithContext[] = [];
  for (const r of rows) {
    const balance = (await getBalances(r.employee_id, Number(r.from_date.slice(0, 4)))).find((b) => b.leave_type_id === r.leave_type_id);
    const clashes = await sql<{ name: string; from_date: ISODate; to_date: ISODate; status: string }[]>`
      select e.full_name as name, lr.from_date, lr.to_date, lr.status from leave_requests lr join employees e on e.id = lr.employee_id
       where lr.status in ('approved','pending') and lr.id <> ${r.id}
         and e.reporting_manager_id = (select reporting_manager_id from employees where id = ${r.employee_id})
         and lr.from_date <= ${r.to_date} and lr.to_date >= ${r.from_date}`;
    out.push({ ...r, balance, clashes });
  }
  return out;
}

/** L7 — team leave (approved + pending) for a month. Managers: direct reports; HR: everyone. */
export async function teamLeaveCalendar(actor: Actor, year: number, month: number) {
  requireManagerOrHr(actor);
  const ids = await teamMemberIds(actor);
  if (!ids.length) return [];
  const { start, end } = monthBounds(year, month);
  return sql<LeaveRequestRow[]>`${requestSelect}
    where r.employee_id in ${sql(ids)} and r.status in ('approved','pending') and r.to_date >= ${start} and r.from_date <= ${end}
    order by e.full_name, r.from_date`;
}

export async function getAttachment(actor: Actor, requestId: number) {
  const [r] = await sql`select employee_id from leave_requests where id = ${requestId}`;
  if (!r) return null;
  if (r.employee_id !== actor.id && !(await canApproveFor(actor, r.employee_id))) throw new AccessDenied();
  const [a] = await sql<{ file_name: string; mime_type: string; content: Buffer }[]>`select file_name, mime_type, content from leave_attachments where leave_request_id = ${requestId}`;
  return a ?? null;
}

// ------------------------------------------------------------------ year end

/**
 * Year-end rollover (HR): for each employee, the closing available balance of `fromYear`
 * becomes next year's opening, limited by carry_forward_max. CL and SL lapse (limit 0). EL carries up to 30.
 */
export async function rolloverYear(actor: Actor, fromYear: number) {
  requireHr(actor);
  const emps = await sql<{ id: number }[]>`select id from employees where last_working_day is null or last_working_day >= ${`${fromYear}-12-31`}::date`;
  let rows = 0;
  for (const e of emps) {
    const bals = await getBalances(e.id, fromYear, `${fromYear}-12-31`);
    for (const b of bals) {
      if (b.unlimited || b.carry_forward_max <= 0) continue;
      const opening = carryForward(b.available, b.carry_forward_max);
      await sql`insert into leave_balances (employee_id, leave_type_id, year, opening) values (${e.id}, ${b.leave_type_id}, ${fromYear + 1}, ${opening})
                on conflict (employee_id, leave_type_id, year) do update set opening = excluded.opening`;
      rows++;
    }
  }
  return rows;
}

export { requireHr };
