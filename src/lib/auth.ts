import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';
import { todayIST } from './ist';
import { isActiveOn, loadActorByEmail, loadActorById, type Actor } from './services/actor';

/**
 * Who is signed in → which employees row → which role. Roles are NEVER read from Clerk:
 * Clerk only proves the email address; is_hr_admin comes from our table and the Manager
 * role is derived (someone active reports to you).
 *
 * AUTH_MODE=clerk  production. Clerk session → verified primary email → employees.email.
 * AUTH_MODE=password  login page: employee code/email + password. One password for HR Admins
 *                  (HR_PASSWORD), one for managers and employees (EMPLOYEE_PASSWORD). The
 *                  password only proves the group; the role still comes from the database.
 * AUTH_MODE=demo   local/demo only. A signed, httpOnly cookie holds an employee id chosen on
 *                  /sign-in. Refused in production unless ALLOW_DEMO_AUTH=true is also set.
 */
export const authMode = (): 'clerk' | 'demo' | 'password' =>
  process.env.AUTH_MODE === 'demo' ? 'demo' : process.env.AUTH_MODE === 'password' ? 'password' : 'clerk';

/** Modes that use our own signed session cookie instead of Clerk. */
export const cookieMode = () => authMode() !== 'clerk';

export function demoAllowed() {
  return authMode() === 'demo' && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_AUTH === 'true');
}
const cookieAllowed = () => authMode() === 'password' || demoAllowed();

const DEMO_COOKIE = 'kinara_demo';
function secret() {
  const s = process.env.SESSION_SECRET || process.env.DEMO_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET must be set (16+ chars) when AUTH_MODE is password or demo');
  return s;
}
const sign = (v: string) => crypto.createHmac('sha256', secret()).update(v).digest('base64url');

export async function setDemoSession(employeeId: number) {
  if (!cookieAllowed()) throw new Error('Cookie sign-in is disabled.');
  const v = String(employeeId);
  (await cookies()).set(DEMO_COOKIE, `${v}.${sign(v)}`, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 });
}
export async function clearDemoSession() {
  (await cookies()).delete(DEMO_COOKIE);
}

async function demoEmployeeId(): Promise<number | null> {
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  const [v, sig] = raw.split('.');
  if (!v || !sig) return null;
  const expected = sign(v);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return Number(v);
}

export type SessionState =
  | { kind: 'signed_out' }
  | { kind: 'no_employee'; email: string }
  | { kind: 'inactive'; actor: Actor }
  | { kind: 'ok'; actor: Actor };

/** Resolve the current request's user. Runs on the server for every page, action and API call. */
export async function getSession(): Promise<SessionState> {
  if (cookieMode()) {
    if (!cookieAllowed()) return { kind: 'signed_out' };
    const id = await demoEmployeeId();
    if (!id) return { kind: 'signed_out' };
    const actor = await loadActorById(id);
    if (!actor) return { kind: 'signed_out' };
    return isActiveOn(actor, todayIST()) ? { kind: 'ok', actor } : { kind: 'inactive', actor };
  }
  const { auth, currentUser } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  if (!userId) return { kind: 'signed_out' };
  const user = await currentUser();
  const primary = user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  // only a verified email may claim an employee row
  if (!primary || primary.verification?.status !== 'verified') return { kind: 'no_employee', email: primary?.emailAddress ?? '' };
  const actor = await loadActorByEmail(primary.emailAddress);
  if (!actor) return { kind: 'no_employee', email: primary.emailAddress };
  // remember the Clerk id the first time (informational; matching is by email)
  await sql`update employees set clerk_user_id = ${userId} where id = ${actor.id} and clerk_user_id is distinct from ${userId}`;
  return isActiveOn(actor, todayIST()) ? { kind: 'ok', actor } : { kind: 'inactive', actor };
}

/** For pages and server actions: a signed-in, active employee — or a redirect. */
export async function requireActor(): Promise<Actor> {
  const s = await getSession();
  if (s.kind === 'signed_out') redirect('/sign-in');
  if (s.kind !== 'ok') redirect('/access-denied');
  return s.actor;
}

/** For API routes: null instead of a redirect. */
export async function actorOrNull(): Promise<Actor | null> {
  const s = await getSession();
  return s.kind === 'ok' ? s.actor : null;
}

// ------------------------------------------------------------------ password login

export type LoginRole = 'hr' | 'manager' | 'employee';

function samePassword(given: string, expected: string | undefined) {
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Check employee code/email + password for the chosen role tab. Returns the employee id, or an
 * error message. The same generic message is used for unknown users and wrong passwords.
 */
export async function verifyPasswordLogin(role: LoginRole, login: string, password: string): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const bad = { ok: false as const, message: 'Wrong employee code / email or password.' };
  if (authMode() !== 'password') return { ok: false, message: 'Password sign-in is not enabled.' };
  const id = login.trim();
  if (!id || !password) return { ok: false, message: 'Enter your employee code (or email) and password.' };
  const [row] = await sql<{ id: number }[]>`select id from employees where upper(employee_code) = upper(${id}) or lower(email) = lower(${id}) limit 1`;
  const actor = row ? await loadActorById(row.id) : null;
  const expected = role === 'hr' ? process.env.HR_PASSWORD : process.env.EMPLOYEE_PASSWORD;
  if (!actor || !samePassword(password, expected)) return bad;
  // the tab must match the role held in the database
  if (role === 'hr' && !actor.is_hr_admin) return { ok: false, message: 'This account is not an HR Admin. Use the Employee or Manager tab.' };
  if (role === 'manager' && !actor.is_manager) return { ok: false, message: 'This account has no direct reports. Use the Employee tab.' };
  if (role !== 'hr' && actor.is_hr_admin) return { ok: false, message: 'HR Admins sign in on the HR Admin tab.' };
  if (!isActiveOn(actor, todayIST())) return { ok: false, message: 'Your access ended on your last working day. Contact HR.' };
  return { ok: true, id: actor.id };
}
