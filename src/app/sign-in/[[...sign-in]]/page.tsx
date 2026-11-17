import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { authMode, demoAllowed, getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { todayIST } from '@/lib/ist';
import { demoSignIn } from '@/app/actions/auth';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const s = await getSession();
  if (s.kind === 'ok') redirect('/');

  if (authMode() === 'clerk') {
    const { SignIn } = await import('@clerk/nextjs');
    return (
      <div className="auth">
        <div style={{ display: 'grid', gap: 20, justifyItems: 'center' }}>
          <Logo light />
          <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" />
          <p style={{ color: '#d9edf0', fontSize: 13, maxWidth: 380, textAlign: 'center' }}>Sign in with the email address HR has on record for you.</p>
        </div>
      </div>
    );
  }

  if (authMode() === 'password') {
    return (
      <div className="auth">
        <div className="panel" style={{ width: 'min(440px, 100%)' }}>
          <Logo />
          <h1>Sign in</h1>
          <p className="muted">Choose who you are signing in as.</p>
          <LoginForm />
        </div>
      </div>
    );
  }

  if (!demoAllowed()) return <div className="auth"><div className="panel">Demo sign-in is disabled in production.</div></div>;
  const today = todayIST();
  const people = await sql<{ id: number; employee_code: string; full_name: string; designation: string; location: string; is_hr_admin: boolean; is_manager: boolean; active: boolean }[]>`
    select e.id, e.employee_code, e.full_name, e.designation, l.short_name as location, e.is_hr_admin,
           exists (select 1 from employees r where r.reporting_manager_id = e.id and (r.last_working_day is null or r.last_working_day >= ${today}::date)) as is_manager,
           (e.last_working_day is null or e.last_working_day >= ${today}::date) as active
      from employees e join locations l on l.id = e.location_id
     order by e.is_hr_admin desc, is_manager desc, e.employee_code`;
  return (
    <div className="auth">
      <div className="panel">
        <Logo />
        <h1 style={{ marginTop: 20 }}>Demo sign-in</h1>
        <p className="muted">This server runs with <code>AUTH_MODE=demo</code>: pick a seeded employee to act as. Roles still come from the database. Production uses Clerk.</p>
        <form action={demoSignIn} className="who-list">
          {people.map((p) => (
            <button key={p.id} name="employee_id" value={p.id} type="submit">
              <span className="avatar">{p.full_name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
              <span style={{ flex: 1 }}>
                <strong>{p.full_name}</strong> <span className="hint">{p.employee_code}</span><br />
                <span className="hint">{p.designation} · {p.location}</span>
              </span>
              {p.is_hr_admin && <span className="badge hr">HR Admin</span>}
              {p.is_manager && <span className="badge mgr">Manager</span>}
              {!p.active && <span className="badge absent">Exited</span>}
            </button>
          ))}
        </form>
      </div>
    </div>
  );
}
