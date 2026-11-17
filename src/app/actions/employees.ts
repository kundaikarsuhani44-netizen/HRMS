'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '@/lib/auth';
import { attempt, bool, str, type ActionResult } from '@/lib/actionResult';
import type { EmployeeInput } from '@/lib/rules/validation';
import {
  createEmployee, deactivateEmployee, reactivateEmployee, revealSensitive, updateEmployee, updateOwnContact,
} from '@/lib/services/employees';

function readEmployee(fd: FormData): EmployeeInput {
  const g = (k: string) => str(fd, k);
  return {
    full_name: g('full_name'), email: g('email'), mobile: g('mobile'), dob: g('dob'), gender: g('gender'),
    address_line: g('address_line'), city: g('city'), state: g('state'), pincode: g('pincode'),
    emergency_name: g('emergency_name'), emergency_relation: g('emergency_relation'), emergency_phone: g('emergency_phone'),
    date_of_joining: g('date_of_joining'), designation: g('designation'),
    department_id: Number(g('department_id')), location_id: Number(g('location_id')),
    reporting_manager_id: g('reporting_manager_id') ? Number(g('reporting_manager_id')) : null,
    salary_grade: g('salary_grade'), is_hr_admin: bool(fd, 'is_hr_admin'),
    pan: g('pan'), aadhaar: g('aadhaar'), uan: g('uan'),
    account_number: g('account_number'), ifsc: g('ifsc'), bank_name: g('bank_name'),
  };
}

export async function createEmployeeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const r = await attempt(async () => {
    const res = await createEmployee(actor, readEmployee(fd));
    if (!res.ok) return { ok: false, errors: res.errors, message: res.message ?? 'Please fix the highlighted fields.' };
    return { ok: true, data: res.id, message: `Created ${res.employee_code}` };
  });
  if (r?.ok) { revalidatePath('/employees'); redirect(`/employees/${r.data}?created=1`); }
  return r;
}

export async function updateEmployeeAction(id: number, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const r = await attempt(async () => {
    const res = await updateEmployee(actor, id, readEmployee(fd));
    if (!res.ok) return { ok: false, errors: res.errors, message: res.message ?? 'Please fix the highlighted fields.' };
    return { ok: true };
  });
  if (r?.ok) { revalidatePath(`/employees/${id}`); redirect(`/employees/${id}?saved=1`); }
  return r;
}

export async function updateOwnContactAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    const res = await updateOwnContact(actor, {
      mobile: str(fd, 'mobile'), address_line: str(fd, 'address_line'), city: str(fd, 'city'), state: str(fd, 'state'),
      pincode: str(fd, 'pincode'), emergency_name: str(fd, 'emergency_name'), emergency_relation: str(fd, 'emergency_relation'),
      emergency_phone: str(fd, 'emergency_phone'),
    });
    if (!res.ok) return { ok: false, errors: res.errors, message: 'Please fix the highlighted fields.' };
    revalidatePath('/profile');
    return { ok: true, message: 'Saved your contact details.' };
  });
}

export async function deactivateAction(id: number, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await deactivateEmployee(actor, id, str(fd, 'last_working_day'), str(fd, 'reason'));
    revalidatePath(`/employees/${id}`);
  }, 'Last working day saved. The employee cannot sign in after that date.');
}

export async function reactivateAction(id: number, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await reactivateEmployee(actor, id, str(fd, 'reason')); revalidatePath(`/employees/${id}`); }, 'Employee reactivated.');
}

/** HR "Reveal": returns the unmasked PAN / account number once, and logs it. */
export async function revealAction(id: number, field: 'pan' | 'account_number'): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => ({ ok: true, data: await revealSensitive(actor, id, field) }));
}
