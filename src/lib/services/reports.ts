import { sql } from '../db';
import { monthBounds, todayIST } from '../ist';
import { sumContributions } from '../rules/dayStatus';
import { maskAadhaar, maskPan } from '../rules/masking';
import { requireManagerOrHr, type Actor } from './actor';
import { computeDays } from './attendance';

export interface MonthEndRow {
  employee_code: string; full_name: string; location: string; designation: string;
  pan_masked: string; aadhaar_masked: string; uan: string;
  days_in_month: number; days_counted: number;
  days_present: number; wfh_days: number;
  leave: Record<string, number>;
  lop_leave: number; lop_absent: number; lop_late: number; lop_days: number;
  late_marks: number; missed_punches: number; holidays: number; weekly_offs: number;
}

/**
 * L8 — month-end summary for the payroll vendor. Managers get their direct reports; HR gets everyone
 * who was employed at any point in the month. Built from the same computeDay() as every calendar.
 * Days after "today" are not counted (a mid-month export is a running total).
 */
export async function monthEndSummary(actor: Actor, year: number, month: number) {
  requireManagerOrHr(actor);
  const { start, end } = monthBounds(year, month);
  const ids = actor.is_hr_admin
    ? (await sql<{ id: number }[]>`select id from employees where date_of_joining <= ${end} and (last_working_day is null or last_working_day >= ${start}::date) order by employee_code`).map((r) => r.id)
    : (await sql<{ id: number }[]>`select id from employees where reporting_manager_id = ${actor.id} and date_of_joining <= ${end} and (last_working_day is null or last_working_day >= ${start}::date)`).map((r) => r.id);
  const types = await sql<{ code: string }[]>`select code from leave_types where code <> 'LOP' order by sort_order, id`;
  const codes = types.map((t) => t.code);
  if (!ids.length) return { rows: [] as MonthEndRow[], codes, start, end };
  const days = await computeDays(ids, start, end, todayIST());
  const stat = await sql<{ employee_id: number; pan: string; aadhaar: string; uan: string | null }[]>`
    select employee_id, pan, aadhaar, uan from employee_statutory where employee_id in ${sql(ids)}`;
  const statBy = new Map(stat.map((s) => [s.employee_id, s]));
  const rows: MonthEndRow[] = [];
  for (const { emp, days: d } of days.values()) {
    const t = sumContributions(d);
    const s = statBy.get(emp.id);
    rows.push({
      employee_code: emp.employee_code, full_name: emp.full_name, location: emp.location_name, designation: emp.designation,
      pan_masked: maskPan(s?.pan), aadhaar_masked: maskAadhaar(s?.aadhaar), uan: s?.uan ?? '',
      days_in_month: d.length,
      days_counted: d.filter((x) => !['future', 'not_employed', 'not_marked', 'in_progress'].includes(x.status)).length,
      days_present: t.present, wfh_days: t.wfh,
      leave: Object.fromEntries(codes.map((c) => [c, t.leave[c] ?? 0])),
      lop_leave: t.lopLeave, lop_absent: t.lopAbsent, lop_late: t.lopLate, lop_days: t.lopTotal,
      late_marks: t.lateMarks, missed_punches: t.missedPunches, holidays: t.holiday, weekly_offs: t.weeklyOff,
    });
  }
  rows.sort((a, b) => a.employee_code.localeCompare(b.employee_code));
  return { rows, codes, start, end };
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard for Excel
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: MonthEndRow[], codes: string[]): string {
  const header = [
    'employee_code', 'name', 'location', 'designation', 'pan_masked', 'aadhaar_masked', 'uan',
    'days_present', 'wfh_days', ...codes.map((c) => `leave_${c}`),
    'lop_leave', 'lop_absent_halfday', 'lop_late', 'lop_days_total', 'late_marks', 'missed_punches', 'holidays', 'weekly_offs',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.employee_code, r.full_name, r.location, r.designation, r.pan_masked, r.aadhaar_masked, r.uan,
      r.days_present, r.wfh_days, ...codes.map((c) => r.leave[c]),
      r.lop_leave, r.lop_absent, r.lop_late, r.lop_days, r.late_marks, r.missed_punches, r.holidays, r.weekly_offs,
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
