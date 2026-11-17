import { sql, RuleError, friendlyDbError } from '../db';
import { todayIST, type ISODate } from '../ist';
import { maskAadhaar, maskAccount, maskPan } from '../rules/masking';
import {
  normalise, validateEmployee, PATTERNS, MESSAGES, INDIAN_STATES,
  type EmployeeInput, type FieldErrors,
} from '../rules/validation';
import { AccessDenied, requireHr, type Actor } from './actor';
import { diff, writeAudit } from './audit';

export interface EmployeeRow {
  id: number; employee_code: string; full_name: string; email: string; mobile: string; dob: ISODate;
  gender: string; address_line: string | null; city: string | null; state: string | null; pincode: string | null;
  emergency_name: string | null; emergency_relation: string | null; emergency_phone: string | null;
  date_of_joining: ISODate; last_working_day: ISODate | null; designation: string;
  department_id: number; department_name: string; location_id: number; location_name: string;
  reporting_manager_id: number | null; manager_name: string | null; manager_code: string | null;
  salary_grade: string | null; is_hr_admin: boolean; is_active: boolean;
}

/** Sensitive data as it may leave the server: masked, always. */
export interface MaskedSensitive {
  pan: string; aadhaar: string; uan: string | null; account: string; ifsc: string | null; bank_name: string | null;
  has_statutory: boolean; has_bank: boolean;
}

const baseSelect = (today: ISODate) => sql`
  select e.id, e.employee_code, e.full_name, e.email, e.mobile, e.dob, e.gender, e.address_line, e.city, e.state,
         e.pincode, e.emergency_name, e.emergency_relation, e.emergency_phone, e.date_of_joining, e.last_working_day,
         e.designation, e.department_id, d.name as department_name, e.location_id, l.short_name as location_name,
         e.reporting_manager_id, m.full_name as manager_name, m.employee_code as manager_code, e.salary_grade, e.is_hr_admin,
         (e.last_working_day is null or e.last_working_day >= ${today}::date) as is_active
    from employees e
    join departments d on d.id = e.department_id
    join locations l on l.id = e.location_id
    left join employees m on m.id = e.reporting_manager_id`;

/** E2 — directory (HR only): search by name/code, filter by department, location, active/inactive. */
export async function listEmployees(actor: Actor, f: { q?: string; departmentId?: number; locationId?: number; status?: 'active' | 'inactive' | 'all' } = {}) {
  requireHr(actor);
  const today = todayIST();
  const q = f.q?.trim();
  return sql<EmployeeRow[]>`
    ${baseSelect(today)}
    where true
      ${q ? sql`and (e.full_name ilike ${'%' + q + '%'} or e.employee_code ilike ${'%' + q + '%'} or e.email ilike ${'%' + q + '%'})` : sql``}
      ${f.departmentId ? sql`and e.department_id = ${f.departmentId}` : sql``}
      ${f.locationId ? sql`and e.location_id = ${f.locationId}` : sql``}
      ${f.status === 'inactive' ? sql`and e.last_working_day < ${today}::date` : f.status === 'all' ? sql`` : sql`and (e.last_working_day is null or e.last_working_day >= ${today}::date)`}
    order by e.employee_code`;
}

/** E3 — a profile. Employees may open only their own; HR may open anyone. Managers: own only. */
export async function getEmployee(actor: Actor, id: number) {
  if (id !== actor.id && !actor.is_hr_admin) throw new AccessDenied('You can only view your own profile.');
  const [emp] = await sql<EmployeeRow[]>`${baseSelect(todayIST())} where e.id = ${id}`;
  if (!emp) return null;
  return { emp, sensitive: await getMaskedSensitive(id) };
}

export async function getMaskedSensitive(id: number): Promise<MaskedSensitive> {
  const [s] = await sql<{ pan: string; aadhaar: string; uan: string | null }[]>`select pan, aadhaar, uan from employee_statutory where employee_id = ${id}`;
  const [b] = await sql<{ account_number: string; ifsc: string; bank_name: string }[]>`select account_number, ifsc, bank_name from employee_bank where employee_id = ${id}`;
  return {
    pan: maskPan(s?.pan), aadhaar: maskAadhaar(s?.aadhaar), uan: s?.uan ?? null,
    account: maskAccount(b?.account_number), ifsc: b?.ifsc ?? null, bank_name: b?.bank_name ?? null,
    has_statutory: !!s, has_bank: !!b,
  };
}

/**
 * HR-only "Reveal" for PAN and bank account. Every reveal is written to audit_log.
 * Aadhaar has no reveal at all: the business rule says it is never displayed unmasked anywhere.
 */
export async function revealSensitive(actor: Actor, employeeId: number, field: 'pan' | 'account_number'): Promise<string> {
  requireHr(actor);
  const value = field === 'pan'
    ? (await sql`select pan as v from employee_statutory where employee_id = ${employeeId}`)[0]?.v
    : (await sql`select account_number as v from employee_bank where employee_id = ${employeeId}`)[0]?.v;
  if (!value) throw new RuleError('Nothing to reveal.');
  await writeAudit(sql, field === 'pan' ? 'employee_statutory' : 'employee_bank', employeeId,
    [{ field: `REVEAL:${field}`, old: null, new: 'viewed unmasked' }], actor.id);
  return value as string;
}

export async function managerOptions() {
  const today = todayIST();
  return sql<{ id: number; employee_code: string; full_name: string; designation: string }[]>`
    select id, employee_code, full_name, designation from employees
     where last_working_day is null or last_working_day >= ${today}::date order by full_name`;
}
export const departments = () => sql<{ id: number; name: string }[]>`select id, name from departments order by name`;
export const locations = () => sql<{ id: number; name: string; short_name: string; city: string; state: string; weekly_off_days: number[] }[]>`
  select id, name, short_name, city, state, weekly_off_days from locations order by id`;

/** E4 — would `managerId` create a cycle for `employeeId`? (The DB trigger enforces this too.) */
export async function wouldCreateCycle(employeeId: number | null, managerId: number | null): Promise<boolean> {
  if (!managerId) return false;
  if (employeeId && managerId === employeeId) return true;
  if (!employeeId) return false;
  const [r] = await sql`
    with recursive chain(id, depth) as (
      select ${managerId}::int, 1
      union all
      select e.reporting_manager_id, c.depth + 1 from employees e join chain c on e.id = c.id
       where e.reporting_manager_id is not null and c.depth < 100)
    select exists (select 1 from chain where id = ${employeeId}) as cycle`;
  return !!r?.cycle;
}

export function normaliseInput(raw: EmployeeInput): EmployeeInput {
  return {
    ...raw,
    full_name: raw.full_name?.trim(),
    email: raw.email?.trim().toLowerCase(),
    mobile: normalise.mobile(raw.mobile ?? ''),
    pincode: raw.pincode ? normalise.pincode(raw.pincode) : '',
    emergency_phone: raw.emergency_phone ? normalise.mobile(raw.emergency_phone) : '',
    pan: raw.pan ? normalise.pan(raw.pan) : '',
    aadhaar: raw.aadhaar ? normalise.aadhaar(raw.aadhaar) : '',
    uan: raw.uan ? normalise.uan(raw.uan) : '',
    ifsc: raw.ifsc ? normalise.ifsc(raw.ifsc) : '',
    account_number: raw.account_number ? normalise.bankAccount(raw.account_number) : '',
    reporting_manager_id: raw.reporting_manager_id ? Number(raw.reporting_manager_id) : null,
    department_id: Number(raw.department_id),
    location_id: Number(raw.location_id),
  };
}

export type SaveResult = { ok: true; id: number; employee_code: string } | { ok: false; errors: FieldErrors; message?: string };

const nullIfBlank = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/** E1 — HR creates an employee. Code KCF#### comes from a DB sequence, so it is unique and never reused. */
export async function createEmployee(actor: Actor, raw: EmployeeInput): Promise<SaveResult> {
  requireHr(actor);
  const input = normaliseInput(raw);
  const errors = validateEmployee(input, 'create');
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    const row = await sql.begin(async (tx) => {
      const [e] = await tx<{ id: number; employee_code: string }[]>`
        insert into employees (full_name, email, mobile, dob, gender, address_line, city, state, pincode,
          emergency_name, emergency_relation, emergency_phone, date_of_joining, designation, department_id,
          location_id, reporting_manager_id, salary_grade, is_hr_admin)
        values (${input.full_name}, ${input.email}, ${input.mobile}, ${input.dob}, ${input.gender},
          ${nullIfBlank(input.address_line)}, ${nullIfBlank(input.city)}, ${nullIfBlank(input.state)}, ${nullIfBlank(input.pincode)},
          ${nullIfBlank(input.emergency_name)}, ${nullIfBlank(input.emergency_relation)}, ${nullIfBlank(input.emergency_phone)},
          ${input.date_of_joining}, ${input.designation.trim()}, ${input.department_id}, ${input.location_id},
          ${input.reporting_manager_id}, ${nullIfBlank(input.salary_grade)}, ${!!input.is_hr_admin})
        returning id, employee_code`;
      await tx`insert into employee_statutory (employee_id, pan, aadhaar, uan) values (${e.id}, ${input.pan!}, ${input.aadhaar!}, ${nullIfBlank(input.uan)})`;
      await tx`insert into employee_bank (employee_id, account_number, ifsc, bank_name) values (${e.id}, ${input.account_number!}, ${input.ifsc!}, ${input.bank_name!.trim()})`;
      await writeAudit(tx, 'employees', e.id, [{ field: 'CREATED', old: null, new: e.employee_code }], actor.id);
      return e;
    });
    return { ok: true, id: row.id, employee_code: row.employee_code };
  } catch (e) {
    return { ok: false, errors: {}, message: friendlyDbError(e) };
  }
}

const JOB_FIELDS = ['designation', 'department_id', 'location_id', 'reporting_manager_id', 'salary_grade', 'is_hr_admin', 'date_of_joining'];
const PERSONAL_FIELDS = ['full_name', 'email', 'mobile', 'dob', 'gender', 'address_line', 'city', 'state', 'pincode', 'emergency_name', 'emergency_relation', 'emergency_phone'];

/** HR edits any field. Job + statutory + bank changes are audited (sensitive values stored masked). */
export async function updateEmployee(actor: Actor, id: number, raw: EmployeeInput): Promise<SaveResult> {
  requireHr(actor);
  const input = normaliseInput(raw);
  const errors = validateEmployee(input, 'edit');
  if (await wouldCreateCycle(id, input.reporting_manager_id)) {
    errors.reporting_manager_id = input.reporting_manager_id === id
      ? 'An employee cannot report to themselves.'
      : 'This would create a reporting cycle: the selected manager already reports (directly or indirectly) to this employee.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    const code = await sql.begin(async (tx) => {
      const [before] = await tx`select * from employees where id = ${id} for update`;
      if (!before) throw new RuleError('Employee not found.');
      const after: Record<string, unknown> = {
        full_name: input.full_name, email: input.email, mobile: input.mobile, dob: input.dob, gender: input.gender,
        address_line: nullIfBlank(input.address_line), city: nullIfBlank(input.city), state: nullIfBlank(input.state),
        pincode: nullIfBlank(input.pincode), emergency_name: nullIfBlank(input.emergency_name),
        emergency_relation: nullIfBlank(input.emergency_relation), emergency_phone: nullIfBlank(input.emergency_phone),
        designation: input.designation.trim(), department_id: input.department_id, location_id: input.location_id,
        reporting_manager_id: input.reporting_manager_id, salary_grade: nullIfBlank(input.salary_grade),
        is_hr_admin: !!input.is_hr_admin, date_of_joining: input.date_of_joining,
      };
      await tx`update employees set ${tx(after as Record<string, string>)}, updated_at = now() where id = ${id}`;
      await writeAudit(tx, 'employees', id, diff(before, after, [...JOB_FIELDS, ...PERSONAL_FIELDS]), actor.id);

      // statutory — only fields that were re-entered
      const [s] = await tx`select pan, aadhaar, uan from employee_statutory where employee_id = ${id}`;
      const newS = { pan: input.pan || s?.pan, aadhaar: input.aadhaar || s?.aadhaar, uan: input.uan || s?.uan || null };
      if (newS.pan && newS.aadhaar) {
        await tx`insert into employee_statutory (employee_id, pan, aadhaar, uan) values (${id}, ${newS.pan}, ${newS.aadhaar}, ${newS.uan})
                 on conflict (employee_id) do update set pan = excluded.pan, aadhaar = excluded.aadhaar, uan = excluded.uan, updated_at = now()`;
        const masked = (r: Record<string, unknown> | undefined) => ({ pan: maskPan(r?.pan as string), aadhaar: maskAadhaar(r?.aadhaar as string), uan: r?.uan ?? null });
        // compare raw, record masked — the audit log must not become a second copy of Aadhaar/PAN
        const changes = (['pan', 'aadhaar', 'uan'] as const)
          .filter((f) => (s?.[f] ?? null) !== (newS[f] ?? null))
          .map((f) => ({ field: f, old: masked(s)[f], new: masked(newS)[f] }));
        await writeAudit(tx, 'employee_statutory', id, changes, actor.id);
      }
      const [b] = await tx`select account_number, ifsc, bank_name from employee_bank where employee_id = ${id}`;
      const newB = { account_number: input.account_number || b?.account_number, ifsc: input.ifsc || b?.ifsc, bank_name: nullIfBlank(input.bank_name) || b?.bank_name };
      if (newB.account_number && newB.ifsc && newB.bank_name) {
        await tx`insert into employee_bank (employee_id, account_number, ifsc, bank_name) values (${id}, ${newB.account_number}, ${newB.ifsc}, ${newB.bank_name})
                 on conflict (employee_id) do update set account_number = excluded.account_number, ifsc = excluded.ifsc, bank_name = excluded.bank_name, updated_at = now()`;
        const changes = (['account_number', 'ifsc', 'bank_name'] as const)
          .filter((f) => (b?.[f] ?? null) !== (newB[f] ?? null))
          .map((f) => f === 'account_number'
            ? { field: f, old: maskAccount(b?.account_number), new: maskAccount(newB.account_number) }
            : { field: f, old: b?.[f], new: newB[f] });
        await writeAudit(tx, 'employee_bank', id, changes, actor.id);
      }
      return before.employee_code as string;
    });
    return { ok: true, id, employee_code: code };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, errors: {}, message: e.message };
    return { ok: false, errors: {}, message: friendlyDbError(e) };
  }
}

export interface SelfServiceInput {
  mobile: string; address_line?: string; city?: string; state?: string; pincode?: string;
  emergency_name?: string; emergency_relation?: string; emergency_phone?: string;
}

/** E5 — an employee edits only their own phone, address and emergency contact. Job fields are not accepted here. */
export async function updateOwnContact(actor: Actor, raw: SelfServiceInput): Promise<{ ok: boolean; errors: FieldErrors }> {
  const input = {
    mobile: normalise.mobile(raw.mobile ?? ''),
    address_line: nullIfBlank(raw.address_line), city: nullIfBlank(raw.city), state: nullIfBlank(raw.state),
    pincode: raw.pincode ? normalise.pincode(raw.pincode) : null,
    emergency_name: nullIfBlank(raw.emergency_name), emergency_relation: nullIfBlank(raw.emergency_relation),
    emergency_phone: raw.emergency_phone ? normalise.mobile(raw.emergency_phone) : null,
  };
  const errors: FieldErrors = {};
  if (!PATTERNS.mobile.test(input.mobile)) errors.mobile = MESSAGES.mobile;
  if (input.pincode && !PATTERNS.pincode.test(input.pincode)) errors.pincode = MESSAGES.pincode;
  if (input.emergency_phone && !PATTERNS.mobile.test(input.emergency_phone)) errors.emergency_phone = MESSAGES.mobile;
  if (input.state && !(INDIAN_STATES as readonly string[]).includes(input.state)) errors.state = 'Pick a state or UT from the list.';
  if (Object.keys(errors).length) return { ok: false, errors };
  await sql.begin(async (tx) => {
    const [before] = await tx`select * from employees where id = ${actor.id} for update`;
    await tx`update employees set ${tx(input as Record<string, string>)}, updated_at = now() where id = ${actor.id}`;
    await writeAudit(tx, 'employees', actor.id, diff(before, input, Object.keys(input)), actor.id, 'self-service');
  });
  return { ok: true, errors: {} };
}

/** E6 — HR sets the last working day. After that date the person cannot sign in. The row is never deleted. */
export async function deactivateEmployee(actor: Actor, id: number, lastWorkingDay: ISODate, reason: string) {
  requireHr(actor);
  if (id === actor.id) throw new RuleError('You cannot deactivate yourself.');
  if (!reason || reason.trim().length < 3) throw new RuleError('Give a reason for the exit.');
  await sql.begin(async (tx) => {
    const [before] = await tx`select last_working_day, date_of_joining from employees where id = ${id} for update`;
    if (!before) throw new RuleError('Employee not found.');
    if (lastWorkingDay < before.date_of_joining) throw new RuleError('Last working day cannot be before the date of joining.');
    await tx`update employees set last_working_day = ${lastWorkingDay}, updated_at = now() where id = ${id}`;
    await writeAudit(tx, 'employees', id, [{ field: 'last_working_day', old: before.last_working_day, new: lastWorkingDay }], actor.id, reason.trim());
    // pending requests by the leaver are cancelled
    await tx`update leave_requests set status = 'cancelled', decided_at = now(), approver_comment = 'Auto-cancelled: employee exit'
              where employee_id = ${id} and status in ('pending','draft') and from_date > ${lastWorkingDay}`;
  });
}

export async function reactivateEmployee(actor: Actor, id: number, reason: string) {
  requireHr(actor);
  await sql.begin(async (tx) => {
    const [before] = await tx`select last_working_day from employees where id = ${id} for update`;
    await tx`update employees set last_working_day = null, updated_at = now() where id = ${id}`;
    await writeAudit(tx, 'employees', id, [{ field: 'last_working_day', old: before?.last_working_day, new: null }], actor.id, reason || 'reactivated');
  });
}
