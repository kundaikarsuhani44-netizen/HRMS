/**
 * IST date utilities. Kinara works with two kinds of time values:
 *   - calendar dates ('YYYY-MM-DD' strings) — always the IST calendar date
 *   - instants (JS Date / timestamptz) — rendered with timeZone 'Asia/Kolkata'
 * Nothing here reads the machine's local time zone, so the app behaves the same
 * whether the server or the laptop is in IST, UTC or anywhere else.
 */
export const TZ = 'Asia/Kolkata';
const IST_OFFSET_MIN = 330; // India has no DST

export type ISODate = string; // 'YYYY-MM-DD'

/** IST calendar date of an instant. */
export function istDate(at: Date = new Date()): ISODate {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** Minutes after IST midnight for an instant (0..1439). */
export function istMinutesOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Build an instant from an IST date + 'HH:MM'. */
export function istInstant(date: ISODate, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MIN * 60_000);
}

export function todayIST(): ISODate {
  return istDate(new Date());
}

export function parseISODate(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** ISO weekday: 1 = Monday … 7 = Sunday. Pure calendar arithmetic, no time zone involved. */
export function isoWeekday(date: ISODate): number {
  const { y, m, d } = parseISODate(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function addDays(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetweenInclusive(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function diffDays(from: ISODate, to: ISODate): number {
  const a = parseISODate(from), b = parseISODate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function monthBounds(year: number, month: number): { start: ISODate; end: ISODate } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISODate(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole years between two dates (age on a date). */
export function yearsBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from), b = parseISODate(to);
  let years = b.y - a.y;
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) years--;
  return years;
}

// ---------------------------------------------------------------- formatting (always IST)
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
});

function utcDate(date: ISODate) {
  const { y, m, d } = parseISODate(date);
  return new Date(Date.UTC(y, m - 1, d));
}
/** '17 Nov 2026' — formats a calendar date (no time zone shift possible). */
export const fmtDate = (date: ISODate | null | undefined) => (date ? dateFmt.format(utcDate(date)) : '—');
export const fmtDateShort = (date: ISODate) => dateShortFmt.format(utcDate(date));
export const fmtWeekday = (date: ISODate) => weekdayFmt.format(utcDate(date));
/** '09:12 am' in IST. */
export const fmtTime = (at: Date | string | null | undefined) => (at ? timeFmt.format(new Date(at)) : '—');
export const fmtDateTime = (at: Date | string | null | undefined) => (at ? dateTimeFmt.format(new Date(at)) + ' IST' : '—');
/** 'HH:MM' (24h) of an instant in IST, for <input type="time">. */
export function istHHMM(at: Date | string | null | undefined): string {
  if (!at) return '';
  const mins = istMinutesOfDay(new Date(at));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
