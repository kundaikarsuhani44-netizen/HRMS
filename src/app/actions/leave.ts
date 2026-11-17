'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActor } from '@/lib/auth';
import { attempt, bool, num, str, type ActionResult } from '@/lib/actionResult';
import { applyLeave, cancelLeave, confirmDraft, decideLeave, discardDraft, previewLeave, type ApplyInput, type Preview } from '@/lib/services/leave';

const readApply = (fd: FormData): ApplyInput => ({
  leave_type_id: num(fd, 'leave_type_id'), from_date: str(fd, 'from_date'), to_date: str(fd, 'to_date') || str(fd, 'from_date'),
  is_half_day: str(fd, 'duration') === 'half', reason: str(fd, 'reason'),
  convert_excess_to_lop: bool(fd, 'convert_excess_to_lop'),
});

export type PreviewView = Omit<Preview, 'type' | 'balance'> & {
  typeName?: string; typeCode?: string; certificateAfter?: number | null; halfDayAllowed?: boolean;
  balance?: { available: number | null; applicable: number | null; pending: number; unlimited: boolean };
};

/** Live preview on the Apply form — same function the submit uses, so the numbers cannot differ. */
export async function previewAction(input: ApplyInput): Promise<PreviewView> {
  const actor = await requireActor();
  const p = await previewLeave(actor, { ...input, reason: input.reason || 'preview' });
  const { type, balance, ...rest } = p;
  return {
    ...rest, errors: rest.errors.filter((e) => e !== 'Give a short reason.'),
    typeName: type?.name, typeCode: type?.code, certificateAfter: type?.certificate_after_days ?? null, halfDayAllowed: type?.half_day_allowed,
    balance: balance && { available: balance.unlimited ? null : balance.available, applicable: balance.unlimited ? null : balance.applicable, pending: balance.pending, unlimited: balance.unlimited },
  };
}

export async function applyLeaveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const file = fd.get('certificate');
  const r = await attempt(async () => {
    let attachment;
    if (file instanceof File && file.size > 0) attachment = { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) };
    const id = await applyLeave(actor, readApply(fd), attachment);
    return { ok: true, data: id };
  });
  if (r?.ok) { revalidatePath('/leave'); redirect('/leave?applied=1'); }
  return r;
}

export async function decideLeaveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  const approve = str(fd, 'decision') === 'approve';
  return attempt(async () => {
    await decideLeave(actor, num(fd, 'id'), approve, str(fd, 'comment'));
    revalidatePath('/approvals');
  }, approve ? 'Approved. The balance is updated and the employee has been emailed.' : 'Rejected. The employee has been emailed.');
}

export async function cancelLeaveAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await cancelLeave(actor, num(fd, 'id')); revalidatePath('/leave'); }, 'Cancelled. Your balance is restored.');
}

export async function confirmDraftAction(draftId: number): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await confirmDraft(actor, draftId); revalidatePath('/leave'); }, 'Submitted for approval. Your manager has been emailed.');
}
export async function discardDraftAction(draftId: number): Promise<ActionResult> {
  const actor = await requireActor();
  return attempt(async () => { await discardDraft(actor, draftId); }, 'Draft discarded.');
}
