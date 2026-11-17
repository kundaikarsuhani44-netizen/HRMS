import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { cookieMode, getSession } from '@/lib/auth';
import { fmtDate } from '@/lib/ist';
import { demoSignOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Access denied' };

export default async function AccessDenied() {
  const s = await getSession();
  const msg = s.kind === 'inactive'
    ? `Your last working day was ${fmtDate(s.actor.last_working_day)}. Your Kinara HR access has ended. For your relieving letter or final settlement, contact HR.`
    : s.kind === 'no_employee'
      ? `${s.email || 'This account'} is not linked to any employee record. Ask HR to check the email address on your profile.`
      : 'You do not have access to this page.';
  return (
    <div className="auth">
      <div className="panel">
        <Logo />
        <h1 style={{ marginTop: 20 }}>Access denied</h1>
        <p>{msg}</p>
        {cookieMode()
          ? <form action={demoSignOut}><button className="btn secondary">Back to sign-in</button></form>
          : <AccessDeniedClerk />}
        {s.kind === 'ok' && <Link href="/" className="btn">Go to dashboard</Link>}
      </div>
    </div>
  );
}

async function AccessDeniedClerk() {
  const { SignOutButton } = await import('@clerk/nextjs');
  return <SignOutButton redirectUrl="/sign-in"><button className="btn secondary">Sign out</button></SignOutButton>;
}
