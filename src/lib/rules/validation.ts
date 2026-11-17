import { isValidISODate, yearsBetween, type ISODate } from '../ist';

/** Indian field formats — the same regexes are enforced again as CHECK constraints in the DB. */
export const PATTERNS = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  aadhaar: /^[0-9]{12}$/,
  uan: /^[0-9]{12}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  mobile: /^[6-9][0-9]{9}$/,
  pincode: /^[0-9]{6}$/,
  bankAccount: /^[0-9]{9,18}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
};

export const MESSAGES = {
  pan: 'PAN must be 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).',
  aadhaar: 'Aadhaar must be exactly 12 digits.',
  uan: 'UAN must be exactly 12 digits (leave blank for a new joiner).',
  ifsc: 'IFSC must be 11 characters: 4 letters, then 0, then 6 letters or digits (e.g. HDFC0001234).',
  mobile: 'Mobile must be 10 digits starting with 6, 7, 8 or 9.',
  pincode: 'PIN code must be 6 digits.',
  bankAccount: 'Account number must be 9 to 18 digits.',
  email: 'Enter a valid email address.',
};

export const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi',
  'Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
] as const;

/** Normalise user input: strip spaces, upper-case where the format is alphabetic. */
export const normalise = {
  pan: (v: string) => v.replace(/\s+/g, '').toUpperCase(),
  aadhaar: (v: string) => v.replace(/[\s-]+/g, ''),
  uan: (v: string) => v.replace(/\s+/g, ''),
  ifsc: (v: string) => v.replace(/\s+/g, '').toUpperCase(),
  mobile: (v: string) => v.replace(/[\s-]+/g, '').replace(/^(\+91|0)/, ''),
  pincode: (v: string) => v.replace(/\s+/g, ''),
  bankAccount: (v: string) => v.replace(/\s+/g, ''),
};

export type FieldErrors = Record<string, string>;

export function check(errors: FieldErrors, field: string, ok: boolean, message: string) {
  if (!ok && !errors[field]) errors[field] = message;
}

export function validateAge18OnJoining(dob: ISODate, doj: ISODate): string | null {
  if (!isValidISODate(dob)) return 'Enter a valid date of birth.';
  if (!isValidISODate(doj)) return 'Enter a valid date of joining.';
  if (yearsBetween(dob, doj) < 18) return 'Employee must be at least 18 years old on the date of joining.';
  return null;
}

export interface EmployeeInput {
  full_name: string; email: string; mobile: string; dob: string; gender: string;
  address_line?: string; city?: string; state?: string; pincode?: string;
  emergency_name?: string; emergency_relation?: string; emergency_phone?: string;
  date_of_joining: string; designation: string; department_id: number; location_id: number;
  reporting_manager_id: number | null; salary_grade?: string; is_hr_admin: boolean;
  pan?: string; aadhaar?: string; uan?: string;
  account_number?: string; ifsc?: string; bank_name?: string;
}

/**
 * Validate an add/edit employee form. On edit, blank statutory/bank fields mean "unchanged"
 * (we never send stored Aadhaar back to the browser, so it cannot be pre-filled).
 */
export function validateEmployee(input: EmployeeInput, mode: 'create' | 'edit'): FieldErrors {
  const e: FieldErrors = {};
  check(e, 'full_name', (input.full_name ?? '').trim().length >= 2, 'Enter the full name.');
  check(e, 'email', PATTERNS.email.test(input.email ?? ''), MESSAGES.email);
  check(e, 'mobile', PATTERNS.mobile.test(input.mobile ?? ''), MESSAGES.mobile);
  check(e, 'gender', ['Female', 'Male', 'Other'].includes(input.gender), 'Select a gender.');
  check(e, 'dob', isValidISODate(input.dob), 'Enter a valid date of birth.');
  check(e, 'date_of_joining', isValidISODate(input.date_of_joining), 'Enter a valid date of joining.');
  if (!e.dob && !e.date_of_joining) {
    const ageErr = validateAge18OnJoining(input.dob, input.date_of_joining);
    if (ageErr) e.dob = ageErr;
  }
  if (input.pincode) check(e, 'pincode', PATTERNS.pincode.test(input.pincode), MESSAGES.pincode);
  if (input.state) check(e, 'state', (INDIAN_STATES as readonly string[]).includes(input.state), 'Pick a state or UT from the list.');
  if (input.emergency_phone) check(e, 'emergency_phone', PATTERNS.mobile.test(input.emergency_phone), MESSAGES.mobile);
  check(e, 'designation', (input.designation ?? '').trim().length >= 2, 'Enter the designation.');
  check(e, 'department_id', Number.isInteger(input.department_id) && input.department_id > 0, 'Select a department.');
  check(e, 'location_id', Number.isInteger(input.location_id) && input.location_id > 0, 'Select a location.');

  const statutoryRequired = mode === 'create';
  if (statutoryRequired || input.pan) check(e, 'pan', PATTERNS.pan.test(input.pan ?? ''), MESSAGES.pan);
  if (statutoryRequired || input.aadhaar) check(e, 'aadhaar', PATTERNS.aadhaar.test(input.aadhaar ?? ''), MESSAGES.aadhaar);
  if (input.uan) check(e, 'uan', PATTERNS.uan.test(input.uan), MESSAGES.uan);
  const bankTouched = !!(input.account_number || input.ifsc);
  if (statutoryRequired || bankTouched) {
    check(e, 'account_number', PATTERNS.bankAccount.test(input.account_number ?? ''), MESSAGES.bankAccount);
    check(e, 'ifsc', PATTERNS.ifsc.test(input.ifsc ?? ''), MESSAGES.ifsc);
  }
  if (statutoryRequired || input.bank_name) check(e, 'bank_name', (input.bank_name ?? '').trim().length >= 2, 'Enter the bank name.');
  return e;
}
