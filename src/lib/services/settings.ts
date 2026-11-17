import { sql, RuleError, friendlyDbError } from '../db';
import { isValidISODate, type ISODate } from '../ist';
import { requireHr, type Actor } from './actor';
import { writeAudit } from './audit';

// ------------------------------------------------------------------ locations & departments
export async function saveLocation(actor: Actor, input: { id?: number; name: string; short_name: string; city: string; state: string; weekly_off_days: number[] }) {
  requireHr(actor);
  const offs = [...new Set(input.weekly_off_days.map(Number))].filter((d) => d >= 1 && d <= 7).sort();
  if (offs.length > 3) throw new RuleError('At most three weekly offs.');
  if (!input.name.trim() || !input.short_name.trim()) throw new RuleError('Name and short name are required.');
  try {
    if (input.id) {
      const [before] = await sql`select * from locations where id = ${input.id}`;
      await sql`update locations set name = ${input.name.trim()}, short_name = ${input.short_name.trim()}, city = ${input.city.trim()}, state = ${input.state}, weekly_off_days = ${offs} where id = ${input.id}`;
      await writeAudit(sql, 'locations', input.id, [{ field: 'weekly_off_days', old: before?.weekly_off_days?.join(','), new: offs.join(',') }].filter((c) => c.old !== c.new), actor.id);
    } else {
      await sql`insert into locations (name, short_name, city, state, weekly_off_days) values (${input.name.trim()}, ${input.short_name.trim()}, ${input.city.trim()}, ${input.state}, ${offs})`;
    }
  } catch (e) { throw new RuleError(friendlyDbError(e)); }
}

export async function addDepartment(actor: Actor, name: string) {
  requireHr(actor);
  if (name.trim().length < 2) throw new RuleError('Enter a department name.');
  try { await sql`insert into departments (name) values (${name.trim()})`; } catch (e) { throw new RuleError(friendlyDbError(e)); }
}

// ------------------------------------------------------------------ A7 holidays
export async function addHoliday(actor: Actor, input: { date: ISODate; name: string; type: string; location_ids: number[] }) {
  requireHr(actor);
  if (!isValidISODate(input.date)) throw new RuleError('Choose a valid date.');
  if (input.name.trim().length < 2) throw new RuleError('Enter the holiday name.');
  if (!['National', 'State', 'Optional'].includes(input.type)) throw new RuleError('Choose National, State or Optional.');
  if (!input.location_ids.length) throw new RuleError('Choose at least one location.');
  try {
    await sql.begin(async (tx) => {
      for (const loc of input.location_ids) {
        const [h] = await tx`insert into holidays (location_id, date, name, type) values (${loc}, ${input.date}, ${input.name.trim()}, ${input.type}) returning id`;
        await writeAudit(tx, 'holidays', h.id, [{ field: 'CREATED', old: null, new: `${input.date} ${input.name} (${input.type})` }], actor.id);
      }
    });
  } catch (e) { throw new RuleError(friendlyDbError(e)); }
}

export async function deleteHoliday(actor: Actor, id: number) {
  requireHr(actor);
  const [h] = await sql`delete from holidays where id = ${id} returning date, name, type`;
  if (h) await writeAudit(sql, 'holidays', id, [{ field: 'DELETED', old: `${h.date} ${h.name} (${h.type})`, new: null }], actor.id);
}

// ------------------------------------------------------------------ L1 leave types
export async function saveLeaveType(actor: Actor, input: {
  id?: number; code: string; name: string; annual_quota: number | null; accrual_method: string; monthly_rate: number | null;
  carry_forward_max: number; half_day_allowed: boolean; is_paid: boolean; certificate_after_days: number | null;
  counts_calendar_days: boolean; eligible_gender: string | null; is_active: boolean;
}) {
  requireHr(actor);
  if (!/^[A-Z]{2,5}$/.test(input.code)) throw new RuleError('Code must be 2–5 capital letters.');
  if (!['annual_prorata', 'monthly', 'on_request', 'none'].includes(input.accrual_method)) throw new RuleError('Choose an accrual method.');
  if (input.accrual_method === 'monthly' && !(Number(input.monthly_rate) > 0)) throw new RuleError('Monthly accrual needs a rate per month.');
  if (input.accrual_method !== 'none' && !(Number(input.annual_quota) > 0)) throw new RuleError('Enter the annual quota.');
  if (input.carry_forward_max < 0) throw new RuleError('Carry-forward limit cannot be negative.');
  const row = {
    code: input.code, name: input.name.trim(), annual_quota: input.accrual_method === 'none' ? null : Number(input.annual_quota),
    accrual_method: input.accrual_method, monthly_rate: input.accrual_method === 'monthly' ? Number(input.monthly_rate) : null,
    carry_forward_max: Number(input.carry_forward_max) || 0, half_day_allowed: !!input.half_day_allowed, is_paid: !!input.is_paid,
    certificate_after_days: input.certificate_after_days === null || Number.isNaN(input.certificate_after_days) ? null : Number(input.certificate_after_days),
    counts_calendar_days: !!input.counts_calendar_days, eligible_gender: input.eligible_gender || null, is_active: !!input.is_active,
  };
  try {
    await sql.begin(async (tx) => {
      if (input.id) {
        const [before] = await tx`select * from leave_types where id = ${input.id}`;
        await tx`update leave_types set ${tx(row as never)} where id = ${input.id}`;
        const changes = Object.keys(row).filter((k) => String(before[k] ?? '') !== String((row as Record<string, unknown>)[k] ?? ''))
          .map((k) => ({ field: k, old: before[k], new: (row as Record<string, unknown>)[k] }));
        await writeAudit(tx, 'leave_types', input.id, changes, actor.id);
      } else {
        const [r] = await tx`insert into leave_types ${tx(row as never)} returning id`;
        await writeAudit(tx, 'leave_types', r.id, [{ field: 'CREATED', old: null, new: row.code }], actor.id);
      }
    });
  } catch (e) { throw new RuleError(friendlyDbError(e)); }
}

// ------------------------------------------------------------------ policy text (source for explain_policy)
export const policies = () => sql<{ id: number; slug: string; title: string; body: string; updated_at: Date }[]>`select id, slug, title, body, updated_at from policy_documents order by id`;

export async function savePolicy(actor: Actor, slug: string, body: string) {
  requireHr(actor);
  if (body.trim().length < 20) throw new RuleError('Policy text is too short.');
  await sql`update policy_documents set body = ${body}, updated_by = ${actor.id}, updated_at = now() where slug = ${slug}`;
  await writeAudit(sql, 'policy_documents', slug, [{ field: 'body', old: '(previous version)', new: `(${body.length} chars)` }], actor.id);
}

export const emailLog = (limit = 50) => sql<{ id: number; to_email: string; subject: string; body: string; status: string; error: string | null; created_at: Date }[]>`
  select id, to_email, subject, body, status, error, created_at from email_log order by id desc limit ${limit}`;

export async function sendDraftEmail(actor: Actor, id: number, send: boolean) {
  requireHr(actor);
  const [d] = await sql`select * from email_log where id = ${id} and status = 'draft'`;
  if (!d) throw new RuleError('Draft not found.');
  if (!send) { await sql`update email_log set status = 'discarded' where id = ${id}`; return; }
  const { sendEmail } = await import('./email');
  await sql`delete from email_log where id = ${id}`;
  await sendEmail({ to: d.to_email, subject: d.subject, text: d.body, related: d.related, createdBy: actor.id });
}
