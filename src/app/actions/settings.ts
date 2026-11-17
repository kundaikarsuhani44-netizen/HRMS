'use server';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/lib/auth';
import { attempt, bool, num, str, type ActionResult } from '@/lib/actionResult';
import { addDepartment, addHoliday, deleteHoliday, saveLeaveType, saveLocation, savePolicy, sendDraftEmail } from '@/lib/services/settings';
import { rolloverYear } from '@/lib/services/leave';

const done = (msg: string) => { revalidatePath('/settings'); return { ok: true, message: msg }; };

export async function addHolidayAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await addHoliday(actor, { date: str(fd, 'date'), name: str(fd, 'name'), type: str(fd, 'type'), location_ids: fd.getAll('location_ids').map(Number) });
    return done('Holiday added.');
  });
}
export async function deleteHolidayAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await deleteHoliday(actor, num(fd, 'id')); return done('Holiday removed.'); });
}
export async function saveLocationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await saveLocation(actor, { id: num(fd, 'id') || undefined, name: str(fd, 'name'), short_name: str(fd, 'short_name'), city: str(fd, 'city'), state: str(fd, 'state'), weekly_off_days: fd.getAll('weekly_off_days').map(Number) });
    return done('Location saved.');
  });
}
export async function addDepartmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await addDepartment(actor, str(fd, 'name')); return done('Department added.'); });
}
export async function saveLeaveTypeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const optNum = (k: string) => (str(fd, k) === '' ? null : num(fd, k));
  return attempt(async () => {
    await saveLeaveType(actor, {
      id: num(fd, 'id') || undefined, code: str(fd, 'code').toUpperCase(), name: str(fd, 'name'),
      annual_quota: optNum('annual_quota'), accrual_method: str(fd, 'accrual_method'), monthly_rate: optNum('monthly_rate'),
      carry_forward_max: num(fd, 'carry_forward_max') || 0, half_day_allowed: bool(fd, 'half_day_allowed'), is_paid: bool(fd, 'is_paid'),
      certificate_after_days: optNum('certificate_after_days'), counts_calendar_days: bool(fd, 'counts_calendar_days'),
      eligible_gender: str(fd, 'eligible_gender') || null, is_active: bool(fd, 'is_active'),
    });
    return done('Leave type saved.');
  });
}
export async function savePolicyAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await savePolicy(actor, str(fd, 'slug'), String(fd.get('body') ?? '')); return done('Policy text saved. The assistant now answers from this version.'); });
}
export async function sendDraftEmailAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const send = str(fd, 'decision') === 'send';
  return attempt(async () => { await sendDraftEmail(actor, num(fd, 'id'), send); return done(send ? 'Email sent.' : 'Draft discarded.'); });
}
export async function rolloverAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { const n = await rolloverYear(actor, num(fd, 'year')); return done(`Carried forward ${n} balance(s) into ${num(fd, 'year') + 1}.`); });
}
