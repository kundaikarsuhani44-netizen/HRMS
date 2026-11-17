import { daysBetweenInclusive, isoWeekday, type ISODate } from '../ist';

export type HolidayType = 'National' | 'State' | 'Optional';

/** Everything needed to know whether a date is a working day for one location. */
export interface LocationCalendar {
  weeklyOffDays: number[]; // ISO weekdays: Panaji [6,7], Verna [7]
  holidays: Map<ISODate, { name: string; type: HolidayType }>;
}

export type DayKind = 'working' | 'weekly_off' | 'holiday';

/**
 * National and State holidays are days off for that location.
 * Optional (restricted) holidays are WORKING days: an employee who wants one applies for leave.
 * A holiday that falls on a weekly off is reported as a holiday.
 */
export function dayKind(date: ISODate, cal: LocationCalendar): DayKind {
  const h = cal.holidays.get(date);
  if (h && h.type !== 'Optional') return 'holiday';
  if (cal.weeklyOffDays.includes(isoWeekday(date))) return 'weekly_off';
  return 'working';
}

export interface LeaveDayCount {
  days: number;
  /** The dates that consume leave, with the amount each one consumes (1 or 0.5). */
  dates: { date: ISODate; amount: number }[];
  /** Dates in the range that do not count, and why (shown on the apply form). */
  excluded: { date: ISODate; why: string }[];
}

/**
 * L3 — leave days between two dates (inclusive).
 * Weekly offs and holidays inside the range are never counted (Konkan has no sandwich rule).
 * Leave types that count calendar days (Maternity, by statute in weeks) count every date.
 */
export function countLeaveDays(
  from: ISODate,
  to: ISODate,
  cal: LocationCalendar,
  opts: { isHalfDay?: boolean; calendarDays?: boolean } = {},
): LeaveDayCount {
  const out: LeaveDayCount = { days: 0, dates: [], excluded: [] };
  if (to < from) return out;
  for (const date of daysBetweenInclusive(from, to)) {
    const kind = opts.calendarDays ? 'working' : dayKind(date, cal);
    if (kind === 'working') {
      const amount = opts.isHalfDay ? 0.5 : 1;
      out.dates.push({ date, amount });
      out.days += amount;
    } else {
      out.excluded.push({
        date,
        why: kind === 'holiday' ? `Holiday — ${cal.holidays.get(date)?.name}` : 'Weekly off',
      });
    }
  }
  return out;
}
