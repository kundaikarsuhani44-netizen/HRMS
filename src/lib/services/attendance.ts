import { sql, RuleError, friendlyDbError } from '../db';
import { addDays, diffDays, istDate, istInstant, monthBounds, todayIST, type ISODate } from '../ist';
import { allocateLeave } from '../rules/allocation';
import {
  applyLateRule, computeDay, isLateCheckIn, sumContributions,
  type AttendanceFact, type DayResult, type LeaveFact,
} from '../rules/dayStatus';
import { canApproveFor, requireHr, requireManagerOrHr, teamMemberIds, AccessDenied, type Actor } from './actor';
import { writeAudit } from './audit';
import { getLocationCalendars } from './calendar';
import { daysBetweenInclusive } from '../ist';

export interface AttendanceRow {
  id: number; employee_id: number; date: ISODate; check_in: Date | null; check_out: Date | null;
  is_wfh: boolean; is_late: boolean; source: string;
}

// ------------------------------------------------------------------ A1 / A3 — punches

/**
 * A1 — one click check-in. The (employee_id, date) unique key means a second click on the same
 * IST day can never create a second row; it just returns the existing record.
 */
export async function checkIn(actor: Actor, now: Date = new Date()) {
  const date = istDate(now);
  const late = isLateCheckIn(now);
  const [row] = await sql<AttendanceRow[]>`
    insert into attendance (employee_id, date, check_in, is_late)
    values (${actor.id}, ${date}, ${now}, ${late})
    on conflict (employee_id, date) do update
      set check_in = coalesce(attendance.check_in, excluded.check_in),
          is_late = case when attendance.check_in is null then excluded.is_late else attendance.is_late end,
          updated_at = case when attendance.check_in is null then now() else attendance.updated_at end
    returning *`;
  return row;
}

export async function checkOut(actor: Actor, now: Date = new Date()) {
  const date = istDate(now);
  const [row] = await sql<AttendanceRow[]>`select * from attendance where employee_id = ${actor.id} and date = ${date}`;
  if (!row?.check_in) throw new RuleError('Check in first.');
  if (row.is_wfh) throw new RuleError('Today is marked Work From Home; no check-out needed.');
  if (new Date(row.check_in) >= now) throw new RuleError('Check-out must be after check-in.');
  const [updated] = await sql<AttendanceRow[]>`
    update attendance set check_out = ${now}, updated_at = now() where id = ${row.id} returning *`;
  return updated;
}

/** A3 — mark a day as Work From Home; counts as Present. Allowed for today or a date within the last 30 days. */
export async function markWfh(actor: Actor, date: ISODate = todayIST(), wfh = true) {
  const today = todayIST();
  if (date > today) throw new RuleError('You can only mark WFH for today or a past day.');
  if (diffDays(date, today) > 30) throw new RuleError('WFH can be marked for at most 30 days back.');
  await sql`
    insert into attendance (employee_id, date, is_wfh, source) values (${actor.id}, ${date}, ${wfh}, 'self')
    on conflict (employee_id, date) do update set is_wfh = excluded.is_wfh, updated_at = now()`;
}

export async function todayRecord(employeeId: number) {
  const [row] = await sql<AttendanceRow[]>`select * from attendance where employee_id = ${employeeId} and date = ${todayIST()}`;
  return row ?? null;
}

// ------------------------------------------------------------------ day status for many people

interface EmpLite { id: number; employee_code: string; full_name: string; location_id: number; location_name: string; designation: string; date_of_joining: ISODate; last_working_day: ISODate | null }

/**
 * Compute DayResult for each employee and each date in [from, to]. Single source for calendars,
 * team view, month-end CSV and the agent. The Late rule is applied per calendar month.
 */
export async function computeDays(employeeIds: number[], from: ISODate, to: ISODate, today: ISODate = todayIST()) {
  if (!employeeIds.length) return new Map<number, { emp: EmpLite; days: DayResult[] }>();
  const emps = await sql<EmpLite[]>`
    select e.id, e.employee_code, e.full_name, e.location_id, l.short_name as location_name, e.designation, e.date_of_joining, e.last_working_day
      from employees e join locations l on l.id = e.location_id where e.id in ${sql(employeeIds)} order by e.employee_code`;
  // look a little wider so leave that starts before `from` is allocated correctly
  const cals = await getLocationCalendars(`${from.slice(0, 4)}-01-01`, `${to.slice(0, 4)}-12-31`);
  const att = await sql<AttendanceRow[]>`
    select * from attendance where employee_id in ${sql(employeeIds)} and date between ${from} and ${to}`;
  const leaves = await sql<{ id: number; employee_id: number; code: string; from_date: ISODate; to_date: ISODate; is_half_day: boolean; days: number; lop_days: number; counts_calendar_days: boolean }[]>`
    select r.id, r.employee_id, t.code, r.from_date, r.to_date, r.is_half_day, r.days, r.lop_days, t.counts_calendar_days
      from leave_requests r join leave_types t on t.id = r.leave_type_id
     where r.employee_id in ${sql(employeeIds)} and r.status = 'approved' and r.to_date >= ${from} and r.from_date <= ${to}`;

  const attBy = new Map<string, AttendanceFact>();
  for (const a of att) attBy.set(`${a.employee_id}|${a.date}`, { check_in: a.check_in ? new Date(a.check_in) : null, check_out: a.check_out ? new Date(a.check_out) : null, is_wfh: a.is_wfh, is_late: a.is_late });
  const leaveBy = new Map<string, LeaveFact[]>();
  const empLoc = new Map(emps.map((e) => [e.id, e.location_id]));
  for (const l of leaves) {
    const cal = cals.get(empLoc.get(l.employee_id)!)!;
    for (const [date, facts] of allocateLeave(l, cal)) {
      const k = `${l.employee_id}|${date}`;
      leaveBy.set(k, [...(leaveBy.get(k) ?? []), ...facts]);
    }
  }
  const dates = daysBetweenInclusive(from, to);
  const out = new Map<number, { emp: EmpLite; days: DayResult[] }>();
  for (const e of emps) {
    const cal = cals.get(e.location_id)!;
    const days = dates.map((date) => computeDay({
      date, today, cal, doj: e.date_of_joining, lwd: e.last_working_day,
      att: attBy.get(`${e.id}|${date}`), leave: leaveBy.get(`${e.id}|${date}`),
    }));
    // Late rule is per calendar month
    const byMonth = new Map<string, DayResult[]>();
    for (const d of days) byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) ?? []), d]);
    for (const m of byMonth.values()) applyLateRule(m);
    out.set(e.id, { emp: e, days });
  }
  return out;
}

/** A4 — my month. Managers/HR may view a team member's month. */
export async function monthFor(actor: Actor, employeeId: number, year: number, month: number) {
  if (employeeId !== actor.id) {
    const team = await teamMemberIds(actor);
    if (!team.includes(employeeId)) throw new AccessDenied('You can only view attendance for yourself or your direct reports.');
  }
  const { start, end } = monthBounds(year, month);
  // Late counting needs the whole month even when the view is partial.
  const res = (await computeDays([employeeId], start, end)).get(employeeId);
  if (!res) throw new RuleError('Employee not found.');
  const att = await sql<AttendanceRow[]>`select * from attendance where employee_id = ${employeeId} and date between ${start} and ${end}`;
  return { ...res, totals: sumContributions(res.days), records: new Map(att.map((a) => [a.date, a])) };
}

/** A6 — who in my team is present / on leave / absent today. Managers: direct reports. HR: everyone. */
export async function teamToday(actor: Actor) {
  requireManagerOrHr(actor);
  const today = todayIST();
  const ids = await teamMemberIds(actor);
  const res = await computeDays(ids, `${today.slice(0, 7)}-01`, today, today);
  const att = ids.length ? await sql<AttendanceRow[]>`select * from attendance where employee_id in ${sql(ids)} and date = ${today}` : [];
  const attBy = new Map(att.map((a) => [a.employee_id, a]));
  return [...res.values()].map(({ emp, days }) => ({ emp, day: days[days.length - 1], record: attBy.get(emp.id) ?? null }));
}

export async function teamMonth(actor: Actor, year: number, month: number) {
  requireManagerOrHr(actor);
  const ids = await teamMemberIds(actor);
  const { start, end } = monthBounds(year, month);
  return [...(await computeDays(ids, start, end)).values()];
}

// ------------------------------------------------------------------ A5 — regularisation

export async function requestRegularisation(actor: Actor, input: { date: ISODate; in: string; out: string; reason: string }) {
  const today = todayIST();
  if (input.date >= today) throw new RuleError('Regularisation is for past days. For today, use Check in / Check out.');
  if (diffDays(input.date, today) > 30) throw new RuleError('You can regularise at most 30 days back.');
  if (!/^\d{2}:\d{2}$/.test(input.in) || !/^\d{2}:\d{2}$/.test(input.out)) throw new RuleError('Enter both times.');
  if (input.out <= input.in) throw new RuleError('Check-out time must be after check-in time.');
  if (!input.reason || input.reason.trim().length < 5) throw new RuleError('Give a reason (at least 5 characters).');
  if (!actor.reporting_manager_id && !actor.is_hr_admin) throw new RuleError('You have no reporting manager to approve this. Contact HR.');
  const [existing] = await sql<{ id: number }[]>`select id from attendance where employee_id = ${actor.id} and date = ${input.date}`;
  try {
    const [r] = await sql<{ id: number }[]>`
      insert into regularisation_requests (employee_id, date, attendance_id, requested_in, requested_out, reason)
      values (${actor.id}, ${input.date}, ${existing?.id ?? null}, ${istInstant(input.date, input.in)}, ${istInstant(input.date, input.out)}, ${input.reason.trim()})
      returning id`;
    return r.id;
  } catch (e) {
    throw new RuleError(friendlyDbError(e));
  }
}

export interface RegRow {
  id: number; employee_id: number; employee_name: string; employee_code: string; date: ISODate;
  requested_in: Date; requested_out: Date; reason: string; status: string; approver_comment: string | null;
  created_at: Date; current_in: Date | null; current_out: Date | null; approver_name: string | null;
}

export async function myRegularisations(actor: Actor) {
  return sql<RegRow[]>`
    select r.*, e.full_name as employee_name, e.employee_code, a.check_in as current_in, a.check_out as current_out, ap.full_name as approver_name
      from regularisation_requests r join employees e on e.id = r.employee_id
      left join attendance a on a.employee_id = r.employee_id and a.date = r.date
      left join employees ap on ap.id = r.approver_id
     where r.employee_id = ${actor.id} order by r.created_at desc limit 20`;
}

export async function pendingRegularisations(actor: Actor) {
  if (!actor.is_hr_admin && !actor.is_manager) return [];
  return sql<RegRow[]>`
    select r.*, e.full_name as employee_name, e.employee_code, a.check_in as current_in, a.check_out as current_out, null as approver_name
      from regularisation_requests r join employees e on e.id = r.employee_id
      left join attendance a on a.employee_id = r.employee_id and a.date = r.date
     where r.status = 'pending' and r.employee_id <> ${actor.id}
       ${actor.is_hr_admin ? sql`` : sql`and e.reporting_manager_id = ${actor.id}`}
     order by r.date`;
}

/** Attendance changes only when the manager approves. */
export async function decideRegularisation(actor: Actor, id: number, approve: boolean, comment: string) {
  await sql.begin(async (tx) => {
    const [r] = await tx`select * from regularisation_requests where id = ${id} for update`;
    if (!r) throw new RuleError('Request not found.');
    if (r.status !== 'pending') throw new RuleError(`This request is already ${r.status}.`);
    if (!(await canApproveFor(actor, r.employee_id))) throw new AccessDenied('You can only decide requests from your direct reports, and never your own.');
    if (!approve && (!comment || comment.trim().length < 3)) throw new RuleError('Add a comment explaining the rejection.');
    await tx`update regularisation_requests set status = ${approve ? 'approved' : 'rejected'}, approver_id = ${actor.id},
               approver_comment = ${comment?.trim() || null}, decided_at = now() where id = ${id}`;
    if (approve) {
      const late = isLateCheckIn(new Date(r.requested_in));
      const [before] = await tx`select id, check_in, check_out from attendance where employee_id = ${r.employee_id} and date = ${r.date}`;
      const [a] = await tx`
        insert into attendance (employee_id, date, check_in, check_out, is_late, is_wfh, source)
        values (${r.employee_id}, ${r.date}, ${r.requested_in}, ${r.requested_out}, ${late}, false, 'regularised')
        on conflict (employee_id, date) do update set check_in = excluded.check_in, check_out = excluded.check_out,
          is_late = excluded.is_late, is_wfh = false, source = 'regularised', updated_at = now()
        returning id`;
      await writeAudit(tx, 'attendance', a.id, [
        { field: 'check_in', old: before?.check_in?.toISOString?.() ?? null, new: new Date(r.requested_in).toISOString() },
        { field: 'check_out', old: before?.check_out?.toISOString?.() ?? null, new: new Date(r.requested_out).toISOString() },
      ], actor.id, `regularisation #${id} approved`);
    }
  });
}

/** HR corrects a record directly — a reason is mandatory and the change is audited. */
export async function hrCorrectAttendance(actor: Actor, input: { employeeId: number; date: ISODate; in: string; out: string; wfh: boolean; reason: string }) {
  requireHr(actor);
  if (!input.reason || input.reason.trim().length < 5) throw new RuleError('A reason is required for an HR correction.');
  if (input.date > todayIST()) throw new RuleError('Cannot correct a future date.');
  if (!input.wfh && (!input.in || !input.out || input.out <= input.in)) throw new RuleError('Enter a check-in and a later check-out, or mark WFH.');
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from attendance where employee_id = ${input.employeeId} and date = ${input.date}`;
    const ci = input.wfh ? null : istInstant(input.date, input.in);
    const co = input.wfh ? null : istInstant(input.date, input.out);
    const [a] = await tx`
      insert into attendance (employee_id, date, check_in, check_out, is_wfh, is_late, source)
      values (${input.employeeId}, ${input.date}, ${ci}, ${co}, ${input.wfh}, ${ci ? isLateCheckIn(ci) : false}, 'hr_correction')
      on conflict (employee_id, date) do update set check_in = excluded.check_in, check_out = excluded.check_out,
        is_wfh = excluded.is_wfh, is_late = excluded.is_late, source = 'hr_correction', updated_at = now()
      returning id`;
    await writeAudit(tx, 'attendance', a.id, [
      { field: 'check_in', old: before?.check_in?.toISOString?.() ?? null, new: ci?.toISOString() ?? null },
      { field: 'check_out', old: before?.check_out?.toISOString?.() ?? null, new: co?.toISOString() ?? null },
      { field: 'is_wfh', old: before?.is_wfh ?? null, new: input.wfh },
    ].filter((c) => String(c.old) !== String(c.new)), actor.id, input.reason.trim());
  });
}

export const lastNDays = (n: number) => addDays(todayIST(), -n);
