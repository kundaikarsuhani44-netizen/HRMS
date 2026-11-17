import { parseISODate, type ISODate } from '../ist';

export type AccrualMethod = 'annual_prorata' | 'monthly' | 'on_request' | 'none';

export interface LeaveTypeRule {
  code: string;
  annual_quota: number | null;
  accrual_method: AccrualMethod;
  monthly_rate: number | null;
  carry_forward_max: number;
  half_day_allowed: boolean;
  is_paid: boolean;
  certificate_after_days: number | null;
  counts_calendar_days: boolean;
  eligible_gender: 'Female' | 'Male' | null;
}

const roundDownToHalf = (n: number) => Math.floor(n * 2 + 1e-9) / 2;
const roundToHalf = (n: number) => Math.round(n * 2) / 2;

/**
 * Months of the leave year an employee is entitled to for an "annual, pro-rated" leave type.
 * Joined on or before the 15th → the joining month counts; after the 15th → it does not.
 * A 1 July joiner gets July–December = 6 months.
 */
export function proRataMonths(doj: ISODate, year: number): number {
  const j = parseISODate(doj);
  if (j.y < year) return 12;
  if (j.y > year) return 0;
  const firstMonth = j.d <= 15 ? j.m : j.m + 1;
  return Math.max(0, 12 - firstMonth + 1);
}

/**
 * Completed calendar months of service inside `year`, up to `asOf` (inclusive).
 * Counting starts at max(1 Jan, date of joining); a month is complete when the same
 * day-of-month in the next month has arrived. Joined 1 Jan, on 17 Nov → 10 completed months.
 */
export function completedMonths(doj: ISODate, year: number, asOf: ISODate): number {
  const start = doj > `${year}-01-01` ? doj : `${year}-01-01`;
  const cap = `${year + 1}-01-01`;
  const until = asOf < cap ? asOf : cap;
  if (until < start) return 0;
  const s = parseISODate(start);
  let n = 0;
  for (let k = 1; k <= 12; k++) {
    // the k-th month anniversary of the start date (clamped to month end, e.g. 31 Jan → 28 Feb)
    const y = s.y + Math.floor((s.m - 1 + k) / 12);
    const m = ((s.m - 1 + k) % 12) + 1;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const anniv = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(s.d, lastDay)).padStart(2, '0')}`;
    if (anniv <= until) n = k; else break;
  }
  return n;
}

/**
 * Leave accrued (credited) in `year` as of `asOf`.
 *  - annual_prorata (CL, SL): full quota credited on 1 Jan; joiners get quota × months/12, to the nearest 0.5
 *  - monthly (EL): monthly_rate per completed month, capped at the annual quota
 *  - on_request (Maternity, Paternity): the statutory / policy entitlement, available when needed
 *  - none (LOP): nothing to accrue, unlimited
 * Accrual stops at the last working day.
 */
export function accrued(
  t: Pick<LeaveTypeRule, 'annual_quota' | 'accrual_method' | 'monthly_rate'>,
  emp: { date_of_joining: ISODate; last_working_day?: ISODate | null },
  year: number,
  asOf: ISODate,
): number {
  if (parseISODate(emp.date_of_joining).y > year) return 0;
  const until = emp.last_working_day && emp.last_working_day < asOf ? emp.last_working_day : asOf;
  const quota = t.annual_quota ?? 0;
  switch (t.accrual_method) {
    case 'annual_prorata':
      return roundToHalf((quota * proRataMonths(emp.date_of_joining, year)) / 12);
    case 'monthly': {
      const earned = (t.monthly_rate ?? 0) * completedMonths(emp.date_of_joining, year, until);
      return Math.min(earned, quota || Infinity);
    }
    case 'on_request':
      return quota;
    default:
      return 0;
  }
}

export interface BalanceParts {
  opening: number;
  accrued: number;
  adjustment: number;
  used: number;     // approved, paid portion
  pending: number;  // submitted, waiting for approval, paid portion
}

/**
 * Available = opening + accrued + adjustment − used. It is never stored (see ARCHITECTURE.md §5):
 * a stored number goes stale the moment a request is approved, cancelled or a joiner's date changes.
 * Pending is shown separately and does NOT reduce the balance (balance changes only on approval),
 * but a new request may only use what is not already claimed by pending requests.
 */
export function available(b: BalanceParts): number {
  return +(b.opening + b.accrued + b.adjustment - b.used).toFixed(2);
}
export function applicable(b: BalanceParts): number {
  return +(available(b) - b.pending).toFixed(2);
}

/**
 * When a request exceeds the balance, split it into a paid part and a Loss-of-Pay part.
 * The paid part is rounded down to the leave type's smallest unit (0.5 if half days are allowed, else 1).
 */
export function splitForBalance(days: number, canUse: number, halfDayAllowed: boolean) {
  const usable = Math.max(0, Math.min(days, canUse));
  const paid = halfDayAllowed ? roundDownToHalf(usable) : Math.floor(usable + 1e-9);
  return { paid, lop: +(days - paid).toFixed(1) };
}

/** Year-end: carry forward up to the limit; everything else lapses. */
export function carryForward(closingAvailable: number, carryForwardMax: number): number {
  return Math.max(0, Math.min(closingAvailable, carryForwardMax));
}
