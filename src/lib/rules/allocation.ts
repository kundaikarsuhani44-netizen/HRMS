import type { ISODate } from '../ist';
import { countLeaveDays, type LocationCalendar } from './calendar';
import type { LeaveFact } from './dayStatus';

/**
 * Spread one approved request over its dates. The paid part is consumed first (earliest dates),
 * the LOP part (excess converted to Loss of Pay) takes the remaining dates. A day may be half
 * paid and half LOP when the paid balance ends on a .5.
 *
 * Dates are recalculated from the location calendar, so a holiday HR adds later inside an
 * approved leave stops being counted as leave on the calendar (the request keeps its original
 * day count for audit).
 */
export function allocateLeave(
  req: { id: number; code: string; from_date: ISODate; to_date: ISODate; is_half_day: boolean; days: number; lop_days: number; counts_calendar_days: boolean },
  cal: LocationCalendar,
): Map<ISODate, LeaveFact[]> {
  const out = new Map<ISODate, LeaveFact[]>();
  const { dates } = countLeaveDays(req.from_date, req.to_date, cal, { isHalfDay: req.is_half_day, calendarDays: req.counts_calendar_days });
  const isLopType = req.code === 'LOP';
  let paidLeft = isLopType ? 0 : req.days - req.lop_days;
  for (const { date, amount } of dates) {
    const facts: LeaveFact[] = [];
    const paid = Math.min(amount, Math.max(0, paidLeft));
    paidLeft -= paid;
    if (paid > 0) facts.push({ code: req.code, amount: paid, requestId: req.id });
    if (amount - paid > 0) facts.push({ code: 'LOP', amount: +(amount - paid).toFixed(1), requestId: req.id });
    out.set(date, facts);
  }
  return out;
}
