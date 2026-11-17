'use server';
import { redirect } from 'next/navigation';
import { clearDemoSession, demoAllowed, setDemoSession, verifyPasswordLogin, type LoginRole } from '@/lib/auth';
import type { ActionResult } from '@/lib/actionResult';

export async function demoSignIn(fd: FormData) {
  if (!demoAllowed()) throw new Error('Demo sign-in is disabled.');
  await setDemoSession(Number(fd.get('employee_id')));
  redirect('/');
}

/** Password login: role tab + employee code/email + password. */
export async function passwordSignIn(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const role = String(fd.get('role') ?? 'employee') as LoginRole;
  const r = await verifyPasswordLogin(['hr', 'manager', 'employee'].includes(role) ? role : 'employee', String(fd.get('login') ?? ''), String(fd.get('password') ?? ''));
  if (!r.ok) return { ok: false, message: r.message };
  await setDemoSession(r.id);
  redirect('/');
}

export async function demoSignOut() {
  await clearDemoSession();
  redirect('/sign-in');
}
