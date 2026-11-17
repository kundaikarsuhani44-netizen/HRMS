/**
 * Seed: 2 locations, 4 departments, 20 employees (1 HR Admin, 3 managers), holidays for the
 * current year, leave types, opening balances, ~2 months of attendance, and sample leave requests.
 *
 *   npm run db:seed                       (refuses to run on a non-empty database)
 *   npm run db:reset                      (drop + migrate + seed)
 *
 * SEED_EMAIL_BASE=you@gmail.com gives every employee a plus-address (you+ananya@gmail.com …),
 * so you can sign in with Clerk as each role and actually receive the notification emails.
 */
import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });
import postgres from 'postgres';
import { addDays, istInstant, todayIST, type ISODate } from '../src/lib/ist';
import { countLeaveDays, type LocationCalendar } from '../src/lib/rules/calendar';
import { isLateCheckIn } from '../src/lib/rules/dayStatus';
import { ATTENDANCE_POLICY, LEAVE_POLICY } from '../src/lib/policyText';

// deterministic PRNG so every seed run looks the same
let s = 20260101;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const digits = (n: number, first = '23456789') => pick(first.split('')) + Array.from({ length: n - 1 }, () => Math.floor(rand() * 10)).join('');
const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(rand() * 26))).join('');

function email(first: string, last: string) {
  const base = process.env.SEED_EMAIL_BASE;
  if (base && base.includes('@')) {
    const [user, domain] = base.split('@');
    return `${user}+${first.toLowerCase()}@${domain}`;
  }
  return `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@konkanfoods.example';
}

type Emp = {
  key: string; first: string; last: string; gender: 'Female' | 'Male'; designation: string; dept: string; loc: 'Panaji' | 'Verna';
  mgr: string | null; doj: ISODate; dob: ISODate; hr?: boolean; lwd?: ISODate; grade: string; uan?: boolean;
};

const EMPLOYEES: Emp[] = [
  { key: 'rajesh', first: 'Rajesh', last: 'Naik', gender: 'Male', designation: 'Plant Head', dept: 'Production', loc: 'Verna', mgr: null, doj: '2015-04-01', dob: '1978-03-12', grade: 'M3' },
  { key: 'ananya', first: 'Ananya', last: 'Prabhu', gender: 'Female', designation: 'HR Manager', dept: 'Human Resources', loc: 'Panaji', mgr: 'rajesh', doj: '2018-06-11', dob: '1988-09-24', hr: true, grade: 'M1' },
  { key: 'sneha', first: 'Sneha', last: 'Kamat', gender: 'Female', designation: 'Sales Manager', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'rajesh', doj: '2017-08-01', dob: '1985-01-30', grade: 'M2' },
  { key: 'vikram', first: 'Vikram', last: 'Desai', gender: 'Male', designation: 'QA Manager', dept: 'Quality Assurance', loc: 'Verna', mgr: 'rajesh', doj: '2016-02-15', dob: '1983-07-08', grade: 'M2' },
  { key: 'ravi', first: 'Ravi', last: 'Gaonkar', gender: 'Male', designation: 'Production Supervisor', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2019-01-07', dob: '1990-11-02', grade: 'S2' },
  { key: 'santosh', first: 'Santosh', last: 'Parab', gender: 'Male', designation: 'Machine Operator', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2020-03-02', dob: '1994-04-17', grade: 'W2' },
  { key: 'pooja', first: 'Pooja', last: 'Shetye', gender: 'Female', designation: 'Packaging Associate', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2021-09-13', dob: '1998-12-05', grade: 'W1' },
  { key: 'mahesh', first: 'Mahesh', last: 'Kerkar', gender: 'Male', designation: 'Maintenance Technician', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2018-11-19', dob: '1989-06-21', grade: 'W3' },
  { key: 'nilesh', first: 'Nilesh', last: 'Sawant', gender: 'Male', designation: 'Machine Operator', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2026-07-01', dob: '2001-02-14', grade: 'W1', uan: false },
  { key: 'fatima', first: 'Fatima', last: 'Shaikh', gender: 'Female', designation: 'Store Keeper', dept: 'Production', loc: 'Verna', mgr: 'rajesh', doj: '2022-05-09', dob: '1995-08-29', grade: 'W2' },
  { key: 'kavita', first: 'Kavita', last: 'Naik', gender: 'Female', designation: 'Admin Executive', dept: 'Human Resources', loc: 'Panaji', mgr: 'rajesh', doj: '2020-10-05', dob: '1993-03-03', grade: 'S1' },
  { key: 'aditya', first: 'Aditya', last: 'Dessai', gender: 'Male', designation: 'Sales Executive', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'sneha', doj: '2021-01-04', dob: '1996-10-10', grade: 'S1' },
  { key: 'priya', first: 'Priya', last: 'Fernandes', gender: 'Female', designation: 'Marketing Executive', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'sneha', doj: '2023-02-01', dob: '1997-05-19', grade: 'S1' },
  { key: 'rohan', first: 'Rohan', last: "D'Souza", gender: 'Male', designation: 'Key Account Executive', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'sneha', doj: '2020-07-15', dob: '1992-01-25', grade: 'S2' },
  { key: 'meera', first: 'Meera', last: 'Lotlikar', gender: 'Female', designation: 'Sales Coordinator', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'sneha', doj: '2024-10-21', dob: '1999-09-09', grade: 'S1' },
  { key: 'kunal', first: 'Kunal', last: 'Bandodkar', gender: 'Male', designation: 'Sales Executive', dept: 'Sales & Marketing', loc: 'Panaji', mgr: 'sneha', doj: '2025-03-03', dob: '1998-07-07', grade: 'S1', lwd: '2026-10-31' },
  { key: 'shweta', first: 'Shweta', last: 'Naique', gender: 'Female', designation: 'QA Analyst', dept: 'Quality Assurance', loc: 'Verna', mgr: 'vikram', doj: '2019-06-03', dob: '1991-04-11', grade: 'S2' },
  { key: 'imran', first: 'Imran', last: 'Khan', gender: 'Male', designation: 'Lab Technician', dept: 'Quality Assurance', loc: 'Verna', mgr: 'vikram', doj: '2022-08-16', dob: '1996-12-30', grade: 'W2' },
  { key: 'divya', first: 'Divya', last: 'Pai', gender: 'Female', designation: 'Food Safety Officer', dept: 'Quality Assurance', loc: 'Verna', mgr: 'vikram', doj: '2023-11-06', dob: '1995-02-02', grade: 'S1' },
  { key: 'ganesh', first: 'Ganesh', last: 'Volvoikar', gender: 'Male', designation: 'QC Inspector', dept: 'Quality Assurance', loc: 'Verna', mgr: 'vikram', doj: '2021-04-12', dob: '1993-08-15', grade: 'W3' },
];

/** Goa holidays. National = the three national holidays only; others per Goa notification; verify movable dates each year. */
function holidaysFor(year: number): { date: string; name: string; type: 'National' | 'State' | 'Optional'; locs: ('Panaji' | 'Verna')[] }[] {
  const both: ('Panaji' | 'Verna')[] = ['Panaji', 'Verna'];
  const fixed = [
    { date: `${year}-01-26`, name: 'Republic Day', type: 'National' as const, locs: both },
    { date: `${year}-05-30`, name: 'Goa Statehood Day', type: 'State' as const, locs: both },
    { date: `${year}-08-15`, name: 'Independence Day', type: 'National' as const, locs: both },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti', type: 'National' as const, locs: both },
    { date: `${year}-12-03`, name: 'Feast of St. Francis Xavier', type: 'State' as const, locs: both },
    { date: `${year}-12-19`, name: 'Goa Liberation Day', type: 'State' as const, locs: both },
    { date: `${year}-12-25`, name: 'Christmas', type: 'State' as const, locs: both },
  ];
  const movable: Record<number, { date: string; name: string; type: 'National' | 'State' | 'Optional'; locs: ('Panaji' | 'Verna')[] }[]> = {
    2026: [
      { date: '2026-03-04', name: 'Holi', type: 'Optional', locs: both },
      { date: '2026-03-19', name: 'Gudi Padwa', type: 'Optional', locs: both },
      { date: '2026-04-03', name: 'Good Friday', type: 'State', locs: both },
      { date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'State', locs: both },
      { date: '2026-09-15', name: 'Ganesh Chaturthi (2nd day)', type: 'State', locs: ['Verna'] },
      { date: '2026-10-20', name: 'Dussehra', type: 'Optional', locs: both },
      { date: '2026-11-08', name: 'Diwali (Narak Chaturdashi)', type: 'State', locs: both },
    ],
  };
  return [...fixed, ...(movable[year] ?? [])];
}

const LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', annual_quota: 8, accrual_method: 'annual_prorata', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, is_paid: true, certificate_after_days: null, counts_calendar_days: false, eligible_gender: null, sort_order: 1 },
  { code: 'SL', name: 'Sick Leave', annual_quota: 7, accrual_method: 'annual_prorata', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, is_paid: true, certificate_after_days: 2, counts_calendar_days: false, eligible_gender: null, sort_order: 2 },
  { code: 'EL', name: 'Earned Leave', annual_quota: 15, accrual_method: 'monthly', monthly_rate: 1.25, carry_forward_max: 30, half_day_allowed: false, is_paid: true, certificate_after_days: null, counts_calendar_days: false, eligible_gender: null, sort_order: 3 },
  { code: 'ML', name: 'Maternity Leave', annual_quota: 182, accrual_method: 'on_request', monthly_rate: null, carry_forward_max: 0, half_day_allowed: false, is_paid: true, certificate_after_days: null, counts_calendar_days: true, eligible_gender: 'Female', sort_order: 4 },
  { code: 'PL', name: 'Paternity Leave', annual_quota: 5, accrual_method: 'on_request', monthly_rate: null, carry_forward_max: 0, half_day_allowed: false, is_paid: true, certificate_after_days: null, counts_calendar_days: false, eligible_gender: 'Male', sort_order: 5 },
  { code: 'LOP', name: 'Loss of Pay', annual_quota: null, accrual_method: 'none', monthly_rate: null, carry_forward_max: 0, half_day_allowed: true, is_paid: false, certificate_after_days: null, counts_calendar_days: false, eligible_gender: null, sort_order: 6 },
];

export async function seed(url: string, opts: { today?: ISODate; force?: boolean; quiet?: boolean } = {}) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connection: { TimeZone: 'Asia/Kolkata' },
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } } });
  s = 20260101;
  const today = opts.today ?? todayIST();
  const year = Number(today.slice(0, 4));
  const log = (m: string) => !opts.quiet && console.log(m);
  try {
    const [{ n }] = await sql`select count(*)::int as n from employees`;
    if (n > 0 && !opts.force) throw new Error('Database already has employees. Use `npm run db:reset` to start over.');

    await sql.begin(async (tx) => {
      const locRows = await tx`insert into locations (name, short_name, city, state, weekly_off_days) values
        ('Panaji Head Office', 'Panaji', 'Panaji', 'Goa', ${[6, 7]}),
        ('Verna Plant', 'Verna', 'Verna', 'Goa', ${[7]}) returning id, short_name`;
      const loc = Object.fromEntries(locRows.map((r) => [r.short_name, r.id as number]));
      const deptRows = await tx`insert into departments (name) values ('Human Resources'), ('Production'), ('Quality Assurance'), ('Sales & Marketing') returning id, name`;
      const dept = Object.fromEntries(deptRows.map((r) => [r.name, r.id as number]));

      for (const t of LEAVE_TYPES) await tx`insert into leave_types ${tx(t as never)}`;
      await tx`insert into policy_documents (slug, title, body) values ('leave', 'Leave policy', ${LEAVE_POLICY}), ('attendance', 'Attendance policy', ${ATTENDANCE_POLICY})`;

      // employees (managers first so reporting_manager_id resolves)
      const ids: Record<string, number> = {};
      for (const e of EMPLOYEES) {
        const [r] = await tx`insert into employees (full_name, email, mobile, dob, gender, address_line, city, state, pincode,
            emergency_name, emergency_relation, emergency_phone, date_of_joining, last_working_day, designation, department_id,
            location_id, reporting_manager_id, salary_grade, is_hr_admin)
          values (${`${e.first} ${e.last}`}, ${email(e.first, e.last)}, ${digits(10, '6789')}, ${e.dob}, ${e.gender},
            ${`H.No. ${Math.floor(rand() * 900 + 100)}, ${pick(['Altinho', 'Fontainhas', 'Porvorim', 'Taleigao', 'Cortalim', 'Nuvem', 'Margao'])}`},
            ${e.loc === 'Panaji' ? 'Panaji' : pick(['Margao', 'Vasco da Gama', 'Verna'])}, 'Goa', ${pick(['403001', '403521', '403722', '403601', '403802'])},
            ${pick(['Sunita', 'Prakash', 'Asha', 'Dinesh', 'Rekha'])} || ' ' || ${e.last}, ${pick(['Spouse', 'Parent', 'Sibling'])}, ${digits(10, '6789')},
            ${e.doj}, ${e.lwd ?? null}, ${e.designation}, ${dept[e.dept]}, ${loc[e.loc]}, ${e.mgr ? ids[e.mgr] : null}, ${e.grade}, ${!!e.hr})
          returning id`;
        ids[e.key] = r.id;
        const pan = `${letters(3)}P${e.last.replace(/[^A-Za-z]/g, '')[0].toUpperCase()}${digits(4, '123456789')}${letters(1)}`;
        await tx`insert into employee_statutory (employee_id, pan, aadhaar, uan) values (${r.id}, ${pan}, ${digits(12)}, ${e.uan === false ? null : '10' + digits(10, '0123456789')})`;
        const bank = pick([['HDFC Bank', 'HDFC0001234'], ['State Bank of India', 'SBIN0000123'], ['ICICI Bank', 'ICIC0002468'], ['Bank of India', 'BKID0001234'], ['Axis Bank', 'UTIB0000568']]);
        await tx`insert into employee_bank (employee_id, account_number, ifsc, bank_name) values (${r.id}, ${digits(14, '123456789')}, ${bank[1]}, ${bank[0]})`;
      }
      log(`Seeded ${EMPLOYEES.length} employees.`);

      // holidays
      for (const y of [year, year + 1]) {
        for (const h of holidaysFor(y)) for (const l of h.locs) {
          await tx`insert into holidays (location_id, date, name, type) values (${loc[l]}, ${h.date}, ${h.name}, ${h.type}) on conflict do nothing`;
        }
      }
      // calendars for working-day maths in the seed
      const hol = await tx<{ location_id: number; date: string; name: string; type: 'National' | 'State' | 'Optional' }[]>`select location_id, date, name, type from holidays`;
      const cal: Record<string, LocationCalendar> = {
        Panaji: { weeklyOffDays: [6, 7], holidays: new Map() },
        Verna: { weeklyOffDays: [7], holidays: new Map() },
      };
      for (const h of hol) cal[h.location_id === loc.Panaji ? 'Panaji' : 'Verna'].holidays.set(h.date, { name: h.name, type: h.type });

      // opening balances: EL carried forward from last year (≤ 30)
      const [el] = await tx`select id from leave_types where code = 'EL'`;
      for (const e of EMPLOYEES) {
        if (Number(e.doj.slice(0, 4)) >= year) continue;
        const opening = Math.min(30, Math.round(rand() * 18) + (e.mgr === null ? 10 : 2));
        await tx`insert into leave_balances (employee_id, leave_type_id, year, opening) values (${ids[e.key]}, ${el.id}, ${year}, ${opening})`;
      }

      // leave requests
      const typeId = Object.fromEntries((await tx`select id, code from leave_types`).map((r) => [r.code, r.id as number]));
      const approverOf = (k: string) => { const m = EMPLOYEES.find((e) => e.key === k)!.mgr; return m ? ids[m] : ids.ananya; };
      const leaveDates = new Map<string, Set<string>>();
      async function leave(k: string, code: string, from: ISODate, to: ISODate, status: string, reason: string, opts2: { half?: boolean; comment?: string } = {}) {
        const e = EMPLOYEES.find((x) => x.key === k)!;
        const c = countLeaveDays(from, to, cal[e.loc], { isHalfDay: opts2.half, calendarDays: code === 'ML' });
        if (c.days === 0) return;
        await tx`insert into leave_requests (employee_id, leave_type_id, from_date, to_date, is_half_day, days, reason, status, approver_id, approver_comment, created_via, submitted_at, decided_at)
          values (${ids[k]}, ${typeId[code]}, ${from}, ${to}, ${!!opts2.half}, ${c.days}, ${reason}, ${status},
                  ${status === 'pending' ? null : approverOf(k)}, ${opts2.comment ?? (status === 'approved' ? 'Approved' : null)}, 'seed', now(),
                  ${status === 'pending' ? null : sql`now()`})`;
        if (status === 'approved') {
          const set = leaveDates.get(k) ?? new Set();
          c.dates.forEach((d) => set.add(d.date));
          leaveDates.set(k, set);
        }
      }
      const d = (n: number) => addDays(today, n);
      // past approved leave
      await leave('santosh', 'SL', d(-40), d(-39), 'approved', 'Fever');
      await leave('aditya', 'CL', d(-25), d(-25), 'approved', 'Family function');
      await leave('shweta', 'EL', d(-20), d(-16), 'approved', 'Hometown visit');
      await leave('mahesh', 'CL', d(-12), d(-12), 'approved', 'Personal work', { half: true });
      await leave('priya', 'SL', d(-8), d(-8), 'approved', 'Migraine');
      await leave('ganesh', 'LOP', d(-6), d(-6), 'approved', 'Personal — no balance needed');
      await leave('rohan', 'CL', d(-30), d(-29), 'rejected', 'Short trip', { comment: 'Quarter-end closing, please pick another date' });
      // today / upcoming
      await leave('imran', 'CL', today, today, 'approved', 'Bank work');
      await leave('aditya', 'EL', d(30), d(32), 'approved', 'Year-end trip');
      await leave('ravi', 'CL', d(7), d(8), 'pending', 'Cousin’s wedding in Ponda');
      await leave('priya', 'EL', d(14), d(16), 'pending', 'Travel to Mumbai');
      await leave('divya', 'SL', d(1), d(1), 'pending', 'Dental appointment', { half: true });
      await leave('pooja', 'CL', d(7), d(7), 'pending', 'School admission for my daughter');

      // attendance: from 1st of previous month to today
      const start = `${today.slice(0, 7)}-01` > addDays(today, -60) ? addDays(`${today.slice(0, 7)}-01`, -31).slice(0, 8) + '01' : addDays(today, -60);
      const nowMin = (() => { const t = new Date(Date.now() + 330 * 60000); return t.getUTCHours() * 60 + t.getUTCMinutes(); })();
      let rows = 0;
      for (const e of EMPLOYEES) {
        const off = leaveDates.get(e.key) ?? new Set();
        let forcedLates = e.key === 'santosh' ? 3 : 0; // Santosh: 3 Late marks this month → half-day LOP
        for (let date = start; date <= today; date = addDays(date, 1)) {
          if (date < e.doj || (e.lwd && date > e.lwd)) continue;
          if (countLeaveDays(date, date, cal[e.loc]).days === 0) continue; // weekly off / holiday
          if (off.has(date)) continue;
          const r = rand();
          const isToday = date === today;
          let inMin: number, outMin: number | null;
          const thisMonth = date.slice(0, 7) === today.slice(0, 7);
          if (forcedLates > 0 && thisMonth && !isToday && rand() < 0.5) { inMin = 10 * 60 + 18 + Math.floor(rand() * 20); outMin = inMin + 8 * 60 + 10; forcedLates--; }
          else if (r < 0.03) continue;                                   // absent, no punch
          else if (r < 0.06 && e.loc === 'Panaji') {                      // WFH
            await tx`insert into attendance (employee_id, date, is_wfh, source) values (${ids[e.key]}, ${date}, true, 'seed')`; rows++; continue;
          }
          else if (r < 0.11) { inMin = 10 * 60 + 16 + Math.floor(rand() * 30); outMin = inMin + 8 * 60 + 5; } // late
          else if (r < 0.14) { inMin = 9 * 60 + Math.floor(rand() * 20); outMin = inMin + 5 * 60; }          // half day
          else if (r < 0.16 && !isToday) { inMin = 9 * 60 + Math.floor(rand() * 30); outMin = null; }        // missed check-out
          else { inMin = 8 * 60 + 45 + Math.floor(rand() * 45); outMin = inMin + 8 * 60 + 20 + Math.floor(rand() * 60); }
          if (isToday) { if (inMin > nowMin || rand() < 0.2) continue; outMin = null; }
          const ci = istInstant(date, `${String(Math.floor(inMin / 60)).padStart(2, '0')}:${String(inMin % 60).padStart(2, '0')}`);
          const co = outMin === null ? null : istInstant(date, `${String(Math.floor(outMin / 60)).padStart(2, '0')}:${String(outMin % 60).padStart(2, '0')}`);
          await tx`insert into attendance (employee_id, date, check_in, check_out, is_late, source) values (${ids[e.key]}, ${date}, ${ci}, ${co}, ${isLateCheckIn(ci)}, 'seed')`;
          rows++;
        }
      }
      log(`Seeded ${rows} attendance records.`);

      // one pending regularisation: Pooja forgot to check out on a recent day
      const [missed] = await tx`select a.id, a.date, a.check_in from attendance a where a.employee_id = ${ids.pooja} and a.check_out is null and a.date < ${today} order by a.date desc limit 1`;
      if (missed) {
        await tx`insert into regularisation_requests (employee_id, date, attendance_id, requested_in, requested_out, reason)
                 values (${ids.pooja}, ${missed.date}, ${missed.id}, ${missed.check_in}, ${istInstant(missed.date, '18:05')}, 'Forgot to check out — left at 6:05 PM after the packing shift')`;
      }
    });
    log('Seed complete.');
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
  seed(url).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
