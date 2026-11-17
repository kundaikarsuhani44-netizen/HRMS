import { istMinutesOfDay, type ISODate } from '../ist';
import { dayKind, type LocationCalendar } from './calendar';

export const LATE_AFTER_MIN = 10 * 60 + 15; // check-in after 10:15 AM IST is Late
export const FULL_DAY_HOURS = 8;
export const HALF_DAY_HOURS = 4;
export const LATES_PER_HALF_DAY_LOP = 3;

export type DayStatus =
  | 'present' | 'half_day' | 'absent' | 'on_leave' | 'holiday' | 'weekly_off'
  | 'in_progress'   // today, checked in, not yet checked out
  | 'not_marked'    // today, working day, no punch yet
  | 'future' | 'not_employed';

export const STATUS_LABEL: Record<DayStatus, string> = {
  present: 'Present', half_day: 'Half Day', absent: 'Absent', on_leave: 'On Leave',
  holiday: 'Holiday', weekly_off: 'Weekly Off', in_progress: 'Checked in', not_marked: 'Not checked in',
  future: '', not_employed: '',
};

export function isLateCheckIn(checkIn: Date): boolean {
  return istMinutesOfDay(checkIn) > LATE_AFTER_MIN;
}

export function hoursWorked(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  return (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
}

/** Hours → status: 8h or more Present; 4 to under 8 Half Day; under 4 Absent. */
export function statusFromHours(h: number): 'present' | 'half_day' | 'absent' {
  if (h >= FULL_DAY_HOURS) return 'present';
  if (h >= HALF_DAY_HOURS) return 'half_day';
  return 'absent';
}

export interface AttendanceFact {
  check_in: Date | null;
  check_out: Date | null;
  is_wfh: boolean;
  is_late: boolean;
}
/** Approved leave consumed on a date (from allocateLeave). code 'LOP' marks the loss-of-pay part. */
export interface LeaveFact { code: string; amount: number; requestId: number }

export interface Contribution {
  present: number;      // includes WFH
  wfh: number;
  leave: Record<string, number>; // paid leave by type code
  lopLeave: number;     // approved LOP leave (incl. excess converted to LOP)
  lopAbsent: number;    // Absent / Half Day / missed punch
  lopLate: number;      // 0.5 for every 3rd Late in the month
  holiday: number;
  weeklyOff: number;
}

export interface DayResult {
  date: ISODate;
  status: DayStatus;
  isLate: boolean;
  isWfh: boolean;
  hours: number | null;
  missedPunch: boolean;
  holidayName?: string;
  optionalHoliday?: string;
  leave: LeaveFact[];
  lateCount?: number; // running count of Late marks in the month (on Late days)
  c: Contribution;
}

const zero = (): Contribution => ({ present: 0, wfh: 0, leave: {}, lopLeave: 0, lopAbsent: 0, lopLate: 0, holiday: 0, weeklyOff: 0 });

/**
 * A2 — the single place that decides a day's status. Used by My Attendance, Team View,
 * the month-end CSV and the HR assistant, so they can never disagree.
 *
 * Precedence: not employed → approved leave → holiday → weekly off → future → punches.
 * "A day with approved leave is On Leave, even if the employee also punched in."
 */
export function computeDay(input: {
  date: ISODate;
  today: ISODate;
  cal: LocationCalendar;
  doj: ISODate;
  lwd: ISODate | null;
  att?: AttendanceFact;
  leave?: LeaveFact[];
}): DayResult {
  const { date, today, cal, att } = input;
  const leave = input.leave ?? [];
  const r: DayResult = { date, status: 'future', isLate: false, isWfh: false, hours: null, missedPunch: false, leave, c: zero() };
  const h = cal.holidays.get(date);
  if (h?.type === 'Optional') r.optionalHoliday = h.name;

  if (date < input.doj || (input.lwd && date > input.lwd)) { r.status = 'not_employed'; return r; }

  const leaveTotal = leave.reduce((s, l) => s + l.amount, 0);
  if (leaveTotal > 0) {
    r.status = 'on_leave';
    for (const l of leave) {
      if (l.code === 'LOP') r.c.lopLeave += l.amount;
      else r.c.leave[l.code] = (r.c.leave[l.code] ?? 0) + l.amount;
    }
    if (leaveTotal >= 1) return r;
    // Half-day leave: the other half is decided by attendance.
    if (date > today) return r;
    if (att?.is_wfh) { r.isWfh = true; r.c.present += 0.5; r.c.wfh += 0.5; return r; }
    r.hours = hoursWorked(att?.check_in ?? null, att?.check_out ?? null);
    r.isLate = !!att?.is_late;
    if (r.hours !== null && r.hours >= HALF_DAY_HOURS) r.c.present += 0.5;
    else if (date < today || (date === today && att?.check_out)) r.c.lopAbsent += 0.5;
    return r;
  }

  const kind = dayKind(date, cal);
  if (kind === 'holiday') { r.status = 'holiday'; r.holidayName = h?.name; r.c.holiday = 1; return r; }
  if (kind === 'weekly_off') { r.status = 'weekly_off'; r.c.weeklyOff = 1; return r; }
  if (date > today) { r.status = 'future'; return r; }

  if (att?.is_wfh) {
    r.status = 'present'; r.isWfh = true; r.c.present = 1; r.c.wfh = 1; return r;
  }
  if (!att?.check_in) {
    if (date === today) { r.status = 'not_marked'; return r; }
    r.status = 'absent'; r.c.lopAbsent = 1; return r;
  }
  r.isLate = att.is_late;
  if (!att.check_out) {
    if (date === today) { r.status = 'in_progress'; return r; }
    // Past day with a check-in but no check-out: a missed punch. Absent until regularised.
    r.status = 'absent'; r.missedPunch = true; r.c.lopAbsent = 1; return r;
  }
  r.hours = hoursWorked(att.check_in, att.check_out);
  r.status = statusFromHours(r.hours!);
  if (r.status === 'present') r.c.present = 1;
  else if (r.status === 'half_day') { r.c.present = 0.5; r.c.lopAbsent = 0.5; }
  else r.c.lopAbsent = 1;
  return r;
}

/** Apply the Late rule across a month: every 3rd Late mark adds half a day of LOP on that day. */
export function applyLateRule(days: DayResult[]): DayResult[] {
  let lates = 0;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!d.isLate) continue;
    lates++;
    d.lateCount = lates;
    if (lates % LATES_PER_HALF_DAY_LOP === 0) d.c.lopLate += 0.5;
  }
  return days;
}

export function sumContributions(days: DayResult[]) {
  const t = zero();
  let lateMarks = 0, missedPunches = 0;
  for (const d of days) {
    t.present += d.c.present; t.wfh += d.c.wfh; t.lopLeave += d.c.lopLeave; t.lopAbsent += d.c.lopAbsent;
    t.lopLate += d.c.lopLate; t.holiday += d.c.holiday; t.weeklyOff += d.c.weeklyOff;
    for (const [k, v] of Object.entries(d.c.leave)) t.leave[k] = (t.leave[k] ?? 0) + v;
    if (d.isLate) lateMarks++;
    if (d.missedPunch) missedPunches++;
  }
  return { ...t, lopTotal: t.lopLeave + t.lopAbsent + t.lopLate, lateMarks, missedPunches };
}
