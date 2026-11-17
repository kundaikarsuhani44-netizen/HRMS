import { describe, expect, it } from 'vitest';
import { accrued, available, applicable, carryForward, completedMonths, proRataMonths, splitForBalance } from '@/lib/rules/accrual';
import { countLeaveDays, type LocationCalendar } from '@/lib/rules/calendar';
import { applyLateRule, computeDay, isLateCheckIn, statusFromHours, sumContributions } from '@/lib/rules/dayStatus';
import { maskAadhaar, maskAccount, maskPan } from '@/lib/rules/masking';
import { PATTERNS, validateAge18OnJoining, validateEmployee } from '@/lib/rules/validation';
import { istDate, istInstant } from '@/lib/ist';

const panaji: LocationCalendar = { weeklyOffDays: [6, 7], holidays: new Map() };
const verna: LocationCalendar = { weeklyOffDays: [7], holidays: new Map([['2026-12-03', { name: 'St Francis Xavier', type: 'State' }]]) };

describe('Indian field validation', () => {
  it('PAN', () => { expect(PATTERNS.pan.test('ABCDE1234F')).toBe(true); expect(PATTERNS.pan.test('ABC123')).toBe(false); });
  it('IFSC', () => { expect(PATTERNS.ifsc.test('HDFC0001234')).toBe(true); expect(PATTERNS.ifsc.test('HDFC1001234')).toBe(false); });
  it('mobile', () => { expect(PATTERNS.mobile.test('9876543210')).toBe(true); expect(PATTERNS.mobile.test('987654321')).toBe(false); expect(PATTERNS.mobile.test('5876543210')).toBe(false); });
  it('aged 17 on joining is rejected, 18 accepted', () => {
    expect(validateAge18OnJoining('2009-01-01', '2026-06-01')).toMatch(/18/);
    expect(validateAge18OnJoining('2008-06-01', '2026-06-01')).toBeNull();
  });
  it('form gives a clear message per field', () => {
    const e = validateEmployee({ full_name: 'A B', email: 'a@b.co', mobile: '98765', dob: '1990-01-01', gender: 'Male', date_of_joining: '2026-01-01', designation: 'Op', department_id: 1, location_id: 1, reporting_manager_id: null, is_hr_admin: false, pan: 'ABC123', aadhaar: '123412341234', account_number: '123456789', ifsc: 'BAD', bank_name: 'SBI' }, 'create');
    expect(e.pan).toMatch(/PAN/); expect(e.ifsc).toMatch(/IFSC/); expect(e.mobile).toMatch(/10 digits/);
  });
});

describe('masking', () => {
  it('PAN ABCDE****F, Aadhaar XXXX XXXX 1234, account last 4', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
    expect(maskAadhaar('987654321234')).toBe('XXXX XXXX 1234');
    expect(maskAccount('50100012345678')).toMatch(/^X+5678$/);
  });
});

describe('working-day count (no sandwich rule)', () => {
  it('Friday→Monday is 2 days at Panaji, 3 at Verna', () => {
    expect(countLeaveDays('2026-11-20', '2026-11-23', panaji).days).toBe(2);
    expect(countLeaveDays('2026-11-20', '2026-11-23', verna).days).toBe(3);
  });
  it('a State holiday at Verna is excluded; Optional holidays still count', () => {
    expect(countLeaveDays('2026-12-02', '2026-12-04', verna).days).toBe(2);
    const opt: LocationCalendar = { weeklyOffDays: [7], holidays: new Map([['2026-12-02', { name: 'x', type: 'Optional' }]]) };
    expect(countLeaveDays('2026-12-02', '2026-12-02', opt).days).toBe(1);
  });
  it('maternity counts calendar days', () => { expect(countLeaveDays('2026-11-20', '2026-11-23', panaji, { calendarDays: true }).days).toBe(4); });
});

describe('accrual', () => {
  const CL = { annual_quota: 8, accrual_method: 'annual_prorata' as const, monthly_rate: null };
  const SL = { annual_quota: 7, accrual_method: 'annual_prorata' as const, monthly_rate: null };
  const EL = { annual_quota: 15, accrual_method: 'monthly' as const, monthly_rate: 1.25 };
  it('1 July joiner gets pro-rated CL 4 and SL 3.5', () => {
    expect(proRataMonths('2026-07-01', 2026)).toBe(6);
    expect(accrued(CL, { date_of_joining: '2026-07-01' }, 2026, '2026-11-17')).toBe(4);
    expect(accrued(SL, { date_of_joining: '2026-07-01' }, 2026, '2026-11-17')).toBe(3.5);
  });
  it('EL 1.25 per completed month', () => {
    expect(completedMonths('2020-01-01', 2026, '2026-11-17')).toBe(10);
    expect(accrued(EL, { date_of_joining: '2020-01-01' }, 2026, '2026-11-17')).toBe(12.5);
  });
  it('balance, pending and LOP split', () => {
    const b = { opening: 0, accrued: 8, adjustment: 0, used: 3, pending: 2 };
    expect(available(b)).toBe(5); expect(applicable(b)).toBe(3);
    expect(splitForBalance(5, 3, true)).toEqual({ paid: 3, lop: 2 });
    expect(carryForward(42, 30)).toBe(30); expect(carryForward(5, 0)).toBe(0);
  });
});

describe('day status (IST)', () => {
  it('times are IST regardless of server zone', () => {
    expect(istDate(new Date('2026-11-16T20:00:00Z'))).toBe('2026-11-17');
    expect(isLateCheckIn(istInstant('2026-11-17', '10:20'))).toBe(true);
    expect(isLateCheckIn(istInstant('2026-11-17', '10:15'))).toBe(false);
  });
  it('5h = Half Day, 8h = Present, <4h Absent', () => {
    expect(statusFromHours(5)).toBe('half_day'); expect(statusFromHours(8)).toBe('present'); expect(statusFromHours(3.9)).toBe('absent');
  });
  it('Saturday: working at plant, weekly off at head office', () => {
    const base = { date: '2026-11-14', today: '2026-11-17', doj: '2020-01-01', lwd: null };
    expect(computeDay({ ...base, cal: panaji }).status).toBe('weekly_off');
    expect(computeDay({ ...base, cal: verna }).status).toBe('absent');
  });
  it('approved leave wins over punches', () => {
    const d = computeDay({ date: '2026-11-16', today: '2026-11-17', cal: panaji, doj: '2020-01-01', lwd: null,
      att: { check_in: istInstant('2026-11-16', '09:00'), check_out: istInstant('2026-11-16', '18:00'), is_wfh: false, is_late: false },
      leave: [{ code: 'CL', amount: 1, requestId: 1 }] });
    expect(d.status).toBe('on_leave');
  });
  it('third Late in a month = half-day LOP', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04'].map((date) => computeDay({ date, today: '2026-11-17', cal: panaji, doj: '2020-01-01', lwd: null,
      att: { check_in: istInstant(date, '10:20'), check_out: istInstant(date, '18:30'), is_wfh: false, is_late: true } }));
    expect(sumContributions(applyLateRule(days)).lopLate).toBe(0.5);
  });
});
