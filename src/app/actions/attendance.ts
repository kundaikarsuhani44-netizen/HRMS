'use server';
import { revalidatePath } from 'next/cache';
import { requireActor } from '@/lib/auth';
import { attempt, bool, num, str, type ActionResult } from '@/lib/actionResult';
import { fmtTime } from '@/lib/ist';
import { checkIn, checkOut, decideRegularisation, hrCorrectAttendance, markWfh, requestRegularisation } from '@/lib/services/attendance';

export async function checkInAction(): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    const r = await checkIn(actor);
    revalidatePath('/');
    return { ok: true, message: `Checked in at ${fmtTime(r.check_in)} IST${r.is_late ? ' — marked Late (after 10:15 AM)' : ''}.` };
  });
}
export async function checkOutAction(): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    const r = await checkOut(actor);
    revalidatePath('/');
    return { ok: true, message: `Checked out at ${fmtTime(r.check_out)} IST.` };
  });
}
export async function wfhAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await markWfh(actor, str(fd, 'date') || undefined, str(fd, 'wfh') !== 'off');
    revalidatePath('/'); revalidatePath('/attendance');
  }, 'Work from home saved — the day counts as Present.');
}
export async function regulariseAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await requestRegularisation(actor, { date: str(fd, 'date'), in: str(fd, 'in'), out: str(fd, 'out'), reason: str(fd, 'reason') });
    revalidatePath('/attendance');
  }, 'Request sent to your manager. Attendance changes only after approval.');
}
export async function decideRegularisationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const approve = str(fd, 'decision') === 'approve';
  return attempt(async () => {
    await decideRegularisation(actor, num(fd, 'id'), approve, str(fd, 'comment'));
    revalidatePath('/approvals');
  }, approve ? 'Regularisation approved — attendance updated.' : 'Regularisation rejected.');
}
export async function hrCorrectAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => {
    await hrCorrectAttendance(actor, { employeeId: num(fd, 'employee_id'), date: str(fd, 'date'), in: str(fd, 'in'), out: str(fd, 'out'), wfh: bool(fd, 'wfh'), reason: str(fd, 'reason') });
    revalidatePath('/team');
  }, 'Attendance corrected and logged in the audit trail.');
}
