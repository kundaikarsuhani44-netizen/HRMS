'use client';
import { useState } from 'react';
import { ActionForm, Field, Submit, useFormResult } from './ActionForm';
import type { ActionResult } from '@/lib/actionResult';
import { INDIAN_STATES } from '@/lib/rules/validation';

type Opt = { id: number; label: string };
export interface EmployeeFormValues {
  full_name?: string; email?: string; mobile?: string; dob?: string; gender?: string;
  address_line?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
  emergency_name?: string | null; emergency_relation?: string | null; emergency_phone?: string | null;
  date_of_joining?: string; designation?: string; department_id?: number; location_id?: number;
  reporting_manager_id?: number | null; salary_grade?: string | null; is_hr_admin?: boolean;
  uan?: string | null; ifsc?: string | null; bank_name?: string | null;
  masked?: { pan: string; aadhaar: string; account: string };
}

const STEPS = [
  { key: 'personal', label: '1 · Personal', fields: ['full_name', 'email', 'mobile', 'dob', 'gender', 'address_line', 'city', 'state', 'pincode'] },
  { key: 'job', label: '2 · Job', fields: ['date_of_joining', 'designation', 'department_id', 'location_id', 'reporting_manager_id', 'salary_grade'] },
  { key: 'statutory', label: '3 · Statutory', fields: ['pan', 'aadhaar', 'uan'] },
  { key: 'bank', label: '4 · Bank', fields: ['account_number', 'ifsc', 'bank_name'] },
  { key: 'emergency', label: '5 · Emergency contact', fields: ['emergency_name', 'emergency_relation', 'emergency_phone'] },
];

/** E1 — multi-step add/edit form. All steps live in one <form>; the server validates everything again. */
export function EmployeeForm({ action, mode, values = {}, departments, locations, managers }: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  mode: 'create' | 'edit'; values?: EmployeeFormValues; departments: Opt[]; locations: Opt[]; managers: Opt[];
}) {
  return (
    <ActionForm action={action}>
      <Steps mode={mode} values={values} departments={departments} locations={locations} managers={managers} />
    </ActionForm>
  );
}

function Steps({ mode, values: v, departments, locations, managers }: { mode: 'create' | 'edit'; values: EmployeeFormValues; departments: Opt[]; locations: Opt[]; managers: Opt[] }) {
  const [step, setStep] = useState(0);
  const errors = useFormResult()?.errors ?? {};
  const stepHasError = (i: number) => STEPS[i].fields.some((f) => errors[f]);
  const req = mode === 'create';
  const show = (i: number) => ({ display: step === i ? undefined : 'none' });
  const keep = mode === 'edit' ? 'Leave blank to keep the current value.' : undefined;
  return (
    <>
      <div className="steps" role="tablist">
        {STEPS.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={step === i} className={`${step === i ? 'active' : ''} ${stepHasError(i) ? 'err' : ''}`} onClick={() => setStep(i)}>
            {s.label}{stepHasError(i) ? ' ⚠' : ''}
          </button>
        ))}
      </div>

      <div style={show(0)} className="form-grid">
        <Field name="full_name" label="Full name" required><input id="full_name" name="full_name" defaultValue={v.full_name} autoComplete="off" /></Field>
        <Field name="email" label="Work email" required help="Used to sign in."><input id="email" name="email" type="email" defaultValue={v.email} /></Field>
        <Field name="mobile" label="Mobile" required help="10 digits, starts with 6–9"><input id="mobile" name="mobile" inputMode="numeric" maxLength={14} defaultValue={v.mobile} /></Field>
        <Field name="gender" label="Gender" required>
          <select id="gender" name="gender" defaultValue={v.gender ?? ''}><option value="">Select…</option><option>Female</option><option>Male</option><option>Other</option></select>
        </Field>
        <Field name="dob" label="Date of birth" required help="Must be 18+ on the date of joining"><input id="dob" name="dob" type="date" defaultValue={v.dob} /></Field>
        <Field name="address_line" label="Address"><input id="address_line" name="address_line" defaultValue={v.address_line ?? ''} /></Field>
        <Field name="city" label="City"><input id="city" name="city" defaultValue={v.city ?? ''} /></Field>
        <Field name="state" label="State / UT">
          <select id="state" name="state" defaultValue={v.state ?? 'Goa'}><option value="">Select…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field name="pincode" label="PIN code" help="6 digits"><input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={v.pincode ?? ''} /></Field>
      </div>

      <div style={show(1)} className="form-grid">
        <Field name="date_of_joining" label="Date of joining" required><input id="date_of_joining" name="date_of_joining" type="date" defaultValue={v.date_of_joining} /></Field>
        <Field name="designation" label="Designation" required><input id="designation" name="designation" defaultValue={v.designation} /></Field>
        <Field name="department_id" label="Department" required>
          <select id="department_id" name="department_id" defaultValue={v.department_id ?? ''}><option value="">Select…</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </Field>
        <Field name="location_id" label="Location" required help="Decides weekly offs and holidays">
          <select id="location_id" name="location_id" defaultValue={v.location_id ?? ''}><option value="">Select…</option>{locations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </Field>
        <Field name="reporting_manager_id" label="Reporting manager" help="Cannot be the employee or anyone who reports to them">
          <select id="reporting_manager_id" name="reporting_manager_id" defaultValue={v.reporting_manager_id ?? ''}><option value="">— None (top of hierarchy) —</option>{managers.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </Field>
        <Field name="salary_grade" label="Salary grade"><input id="salary_grade" name="salary_grade" defaultValue={v.salary_grade ?? ''} /></Field>
        <div className="field span-2"><label className="check"><input type="checkbox" name="is_hr_admin" defaultChecked={v.is_hr_admin} /> HR Admin (full access to every employee)</label></div>
      </div>

      <div style={show(2)} className="form-grid">
        {v.masked && <div className="alert info span-2">Current: PAN <span className="mono">{v.masked.pan}</span> · Aadhaar <span className="mono">{v.masked.aadhaar}</span>. Stored values are never sent back to the browser.</div>}
        <Field name="pan" label="PAN" required={req} help={keep ?? '5 letters, 4 digits, 1 letter — e.g. ABCDE1234F'}><input id="pan" name="pan" maxLength={10} autoComplete="off" style={{ textTransform: 'uppercase' }} /></Field>
        <Field name="aadhaar" label="Aadhaar" required={req} help={keep ?? '12 digits. Never shown unmasked.'}><input id="aadhaar" name="aadhaar" inputMode="numeric" maxLength={14} autoComplete="off" /></Field>
        <Field name="uan" label="UAN (PF number)" help="12 digits — optional for new joiners"><input id="uan" name="uan" inputMode="numeric" maxLength={12} defaultValue={v.uan ?? ''} autoComplete="off" /></Field>
      </div>

      <div style={show(3)} className="form-grid">
        {v.masked && <div className="alert info span-2">Current account: <span className="mono">{v.masked.account}</span></div>}
        <Field name="account_number" label="Account number" required={req} help={keep ?? '9–18 digits'}><input id="account_number" name="account_number" inputMode="numeric" maxLength={18} autoComplete="off" /></Field>
        <Field name="ifsc" label="IFSC" required={req} help="4 letters, 0, then 6 letters/digits — e.g. HDFC0001234"><input id="ifsc" name="ifsc" maxLength={11} defaultValue={v.ifsc ?? ''} style={{ textTransform: 'uppercase' }} /></Field>
        <Field name="bank_name" label="Bank name" required={req}><input id="bank_name" name="bank_name" defaultValue={v.bank_name ?? ''} /></Field>
      </div>

      <div style={show(4)} className="form-grid">
        <Field name="emergency_name" label="Contact name"><input id="emergency_name" name="emergency_name" defaultValue={v.emergency_name ?? ''} /></Field>
        <Field name="emergency_relation" label="Relation"><input id="emergency_relation" name="emergency_relation" defaultValue={v.emergency_relation ?? ''} /></Field>
        <Field name="emergency_phone" label="Contact phone" help="10 digits, starts with 6–9"><input id="emergency_phone" name="emergency_phone" inputMode="numeric" maxLength={14} defaultValue={v.emergency_phone ?? ''} /></Field>
      </div>

      <div className="row between" style={{ marginTop: 8 }}>
        <div className="row">
          <button type="button" className="btn secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>‹ Back</button>
          {step < STEPS.length - 1 && <button type="button" className="btn secondary" onClick={() => setStep(step + 1)}>Next ›</button>}
        </div>
        <Submit pendingText="Saving…">{mode === 'create' ? 'Create employee' : 'Save changes'}</Submit>
      </div>
    </>
  );
}
