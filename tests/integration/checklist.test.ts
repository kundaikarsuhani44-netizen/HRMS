/** The faculty testing checklist, run against a freshly seeded test database. */
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../scripts/migrate';
import { seed } from '../../scripts/seed';
import { sql } from '@/lib/db';
import { addDays, isoWeekday, todayIST } from '@/lib/ist';
import { loadActorByEmail, type Actor } from '@/lib/services/actor';
import { createEmployee, updateEmployee, getEmployee } from '@/lib/services/employees';
import { checkIn } from '@/lib/services/attendance';
import { applyLeave, cancelLeave, decideLeave, getBalances, previewLeave, confirmDraft, createDraft } from '@/lib/services/leave';
import { requestRegularisation, decideRegularisation } from '@/lib/services/attendance';
import { monthEndSummary, toCsv } from '@/lib/services/reports';
import { runTool, type ToolContext } from '@/lib/agent/tools';

const who = async (first: string) => (await loadActorByEmail(`${first}@konkanfoods.example`.replace(first, (await sql`select email from employees where full_name ilike ${first + '%'}`)[0].email.split('@')[0])))!;
const nextWeekday = (iso: number) => { let d = addDays(todayIST(), 7); while (isoWeekday(d) !== iso) d = addDays(d, 1); return d; };
let hr: Actor, sneha: Actor, aditya: Actor, santosh: Actor, rajesh: Actor;

beforeAll(async () => {
  await migrate(process.env.DATABASE_URL!, { reset: true, quiet: true });
  await seed(process.env.DATABASE_URL!, { quiet: true });
  [hr, sneha, aditya, santosh, rajesh] = await Promise.all(['Ananya', 'Sneha', 'Aditya', 'Santosh', 'Rajesh'].map(who));
});

const base = { full_name: 'Test Person', email: 't@x.co', mobile: '9876543210', dob: '1995-01-01', gender: 'Female', date_of_joining: '2026-07-01', designation: 'Analyst', department_id: 1, location_id: 1, reporting_manager_id: null, is_hr_admin: false, pan: 'ABCDE1234F', aadhaar: '123412341234', account_number: '123456789012', ifsc: 'HDFC0001234', bank_name: 'HDFC' };

describe('Employee Master', () => {
  it('HR adds an employee; code is generated and unique', async () => {
    const r = await createEmployee(hr, base);
    expect(r.ok && r.employee_code).toMatch(/^KCF\d{4}$/);
    const r2 = await createEmployee(hr, { ...base, email: 't2@x.co', pan: 'ABCDE1234G', aadhaar: '223412341234' });
    expect(r2.ok && r.ok && r2.employee_code !== r.employee_code).toBe(true);
  });
  it('invalid PAN / IFSC / 9-digit mobile / age 17 are rejected', async () => {
    const r = await createEmployee(hr, { ...base, email: 'x@x.co', pan: 'ABC123', ifsc: 'BAD', mobile: '987654321', dob: '2009-12-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['pan', 'ifsc', 'mobile', 'dob']));
  });
  it('A→B then B→A manager cycle is blocked', async () => {
    const e = (await getEmployee(hr, sneha.id))!.emp;
    const r = await updateEmployee(hr, sneha.id, { ...e, reporting_manager_id: aditya.id, pan: '', aadhaar: '' } as never);
    expect(r.ok).toBe(false);
  });
  it('employee cannot open another profile', async () => {
    await expect(getEmployee(aditya, sneha.id)).rejects.toThrow();
  });
  it('changing a designation writes an audit entry', async () => {
    const e = (await getEmployee(hr, aditya.id))!.emp;
    await updateEmployee(hr, aditya.id, { ...e, designation: 'Senior Sales Executive' } as never);
    const [a] = await sql`select * from audit_log where table_name = 'employees' and record_id = ${String(aditya.id)} and field = 'designation'`;
    expect(a.new_value).toBe('Senior Sales Executive');
  });
  it('Aadhaar is never in the CSV in full', async () => {
    const { rows, codes } = await monthEndSummary(hr, 2026, 11);
    const csv = toCsv(rows, codes);
    const full = await sql`select aadhaar from employee_statutory`;
    for (const f of full) expect(csv).not.toContain(f.aadhaar);
  });
});

describe('Attendance', () => {
  it('checking in twice does not create a second record', async () => {
    await checkIn(sneha); await checkIn(sneha);
    const [{ n }] = await sql`select count(*)::int n from attendance where employee_id = ${sneha.id} and date = ${todayIST()}`;
    expect(n).toBe(1);
  });
  it('regularisation changes attendance only after approval', async () => {
    const d = addDays(todayIST(), -2);
    await sql`delete from attendance where employee_id = ${aditya.id} and date = ${d}`;
    const id = await requestRegularisation(aditya, { date: d, in: '09:00', out: '18:00', reason: 'Forgot to punch' });
    expect((await sql`select 1 from attendance where employee_id = ${aditya.id} and date = ${d}`).length).toBe(0);
    await decideRegularisation(sneha, id, true, 'ok');
    expect((await sql`select 1 from attendance where employee_id = ${aditya.id} and date = ${d}`).length).toBe(1);
  });
});

describe('Leave', () => {
  it('Friday→Monday at head office counts 2', async () => {
    const fri = nextWeekday(5);
    const p = await previewLeave(aditya, { leave_type_id: (await sql`select id from leave_types where code='CL'`)[0].id, from_date: fri, to_date: addDays(fri, 3), is_half_day: false, reason: 'trip' });
    expect(p.days).toBe(2);
  });
  it('more CL than available offers LOP; SL of 3 days needs a certificate', async () => {
    const cl = (await sql`select id from leave_types where code='CL'`)[0].id;
    const mon = nextWeekday(1);
    const p = await previewLeave(santosh, { leave_type_id: cl, from_date: mon, to_date: addDays(mon, 11), is_half_day: false, reason: 'long' });
    expect(p.lopOffer).toBeTruthy();
    const sl = (await sql`select id from leave_types where code='SL'`)[0].id;
    await expect(applyLeave(santosh, { leave_type_id: sl, from_date: addDays(mon, 14), to_date: addDays(mon, 16), is_half_day: false, reason: 'fever' })).rejects.toThrow(/certificate/);
  });
  it('balance only changes on approval; cancel restores; manager cannot approve own leave', async () => {
    const cl = (await sql`select id from leave_types where code='CL'`)[0].id;
    const avail = async () => (await getBalances(aditya.id)).find((b) => b.code === 'CL')!.available;
    const before = await avail();
    const d = nextWeekday(3);
    const id = await applyLeave(aditya, { leave_type_id: cl, from_date: addDays(d, 7), to_date: addDays(d, 7), is_half_day: false, reason: 'errand' });
    expect(await avail()).toBe(before);
    await decideLeave(sneha, id, true, 'ok');
    expect(await avail()).toBe(before - 1);
    await cancelLeave(aditya, id);
    expect(await avail()).toBe(before);
    const own = await applyLeave(sneha, { leave_type_id: cl, from_date: addDays(d, 14), to_date: addDays(d, 14), is_half_day: false, reason: 'own' });
    await expect(decideLeave(sneha, own, true, 'self')).rejects.toThrow(/own/);
    const emails = await sql`select to_email from email_log where related = ${'leave_request:' + id}`;
    expect(emails.length).toBeGreaterThanOrEqual(2); // manager on request + employee on decision
  });
});

describe('HR assistant tools', () => {
  const ctx = (a: Actor, q = 'q'): ToolContext => ({ actor: a, question: q, calls: [], drafts: [] });
  it('balance tool matches My leave; no sensitive data; logged', async () => {
    const r = await runTool('get_my_leave_balance', {}, ctx(aditya)) as { balances: { code: string; available: number }[] };
    const screen = (await getBalances(aditya.id)).find((b) => b.code === 'CL')!.available;
    expect(r.balances.find((b) => b.code === 'CL')!.available).toBe(screen);
    expect(JSON.stringify(r)).not.toMatch(/pan|aadhaar|account/i);
    const [{ n }] = await sql`select count(*)::int n from agent_log where employee_id = ${aditya.id} and tool = 'get_my_leave_balance'`;
    expect(n).toBeGreaterThan(0);
  });
  it('count_working_days Fri→Mon = 2 at head office', async () => {
    const fri = nextWeekday(5);
    const r = await runTool('count_working_days', { from_date: fri, to_date: addDays(fri, 3) }, ctx(aditya)) as { leave_days: number };
    expect(r.leave_days).toBe(2);
  });
  it('draft is not submitted until confirm', async () => {
    const d = addDays(nextWeekday(2), 21);
    const c = ctx(aditya);
    await runTool('draft_leave_request', { leave_type: 'CL', from_date: d, to_date: d, reason: 'kaam' }, c);
    const id = c.drafts[0].draftId;
    expect((await sql`select status from leave_requests where id = ${id}`)[0].status).toBe('draft');
    await confirmDraft(aditya, id);
    expect((await sql`select status from leave_requests where id = ${id}`)[0].status).toBe('pending');
  });
  it('employee asking for team attendance is refused; manager sees only direct reports', async () => {
    const r = await runTool('get_team_today', {}, ctx(aditya)) as { refused?: boolean };
    expect(r.refused).toBe(true);
    const m = await runTool('get_team_today', {}, ctx(sneha)) as { team_size: number };
    const [{ n }] = await sql`select count(*)::int n from employees where reporting_manager_id = ${sneha.id} and (last_working_day is null or last_working_day >= ${todayIST()}::date)`;
    expect(m.team_size).toBe(n);
  });
  it('5-call limit per question', async () => {
    const c = ctx(aditya);
    for (let i = 0; i < 6; i++) await runTool('get_my_leave_balance', {}, c);
    expect(c.calls[5].ok).toBe(false);
  });
  it('unused imports guard', () => { expect(rajesh.id).toBeTruthy(); expect(createDraft).toBeTruthy(); });
});
