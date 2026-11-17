import type { ReactNode } from 'react';
import { LogoMark } from '@/components/Logo';
import { MobileNav, SideNav, type NavItem } from '@/components/Nav';
import { cookieMode, requireActor } from '@/lib/auth';
import { sql } from '@/lib/db';
import { demoSignOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const approver = actor.is_hr_admin || actor.is_manager;
  let pending = 0;
  if (approver) {
    const [r] = await sql<{ n: number }[]>`
      select (select count(*) from leave_requests lr join employees e on e.id = lr.employee_id where lr.status = 'pending' and lr.employee_id <> ${actor.id} ${actor.is_hr_admin ? sql`` : sql`and e.reporting_manager_id = ${actor.id}`})
           + (select count(*) from regularisation_requests rr join employees e on e.id = rr.employee_id where rr.status = 'pending' and rr.employee_id <> ${actor.id} ${actor.is_hr_admin ? sql`` : sql`and e.reporting_manager_id = ${actor.id}`}) as n`;
    pending = Number(r.n);
  }
  const items: NavItem[] = [
    { href: '/', label: 'Home', icon: '⌂', mobile: true, group: 'Me' },
    { href: '/attendance', label: 'My attendance', icon: '◷', mobile: true, group: 'Me' },
    { href: '/leave', label: 'My leave', icon: '☀', mobile: true, group: 'Me' },
    { href: '/leave/apply', label: 'Apply leave', icon: '+', group: 'Me' },
    { href: '/profile', label: 'My profile', icon: '☺', group: 'Me' },
    { href: '/assistant', label: 'Ask HR', icon: '✦', mobile: true, group: 'Me' },
    ...(approver ? [
      { href: '/approvals', label: 'Approvals', icon: '✓', count: pending, mobile: true, group: 'Team' },
      { href: '/team', label: 'Team attendance', icon: '☷', group: 'Team' },
      { href: '/leave-calendar', label: 'Leave calendar', icon: '▦', group: 'Team' },
      { href: '/reports', label: 'Reports', icon: '⇩', group: 'Team' },
    ] : []),
    ...(actor.is_hr_admin ? [
      { href: '/employees', label: 'Employees', icon: '☰', group: 'HR Admin' },
      { href: '/settings', label: 'Settings', icon: '⚙', group: 'HR Admin' },
    ] : []),
  ];
  if (!approver) items.find((i) => i.href === '/profile')!.mobile = true;
  const role = actor.is_hr_admin ? 'HR Admin' : actor.is_manager ? 'Manager' : 'Employee';
  const initials = actor.full_name.split(' ').map((x) => x[0]).join('').slice(0, 2);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><LogoMark size={34} /><span>Kinara HR<small>Konkan Coastal Foods</small></span></div>
        <SideNav items={items} />
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="row" style={{ gap: 8 }}><span className="mobile-only-logo"><LogoMark size={28} /></span><strong style={{ fontSize: 15 }}>Kinara HR</strong></span>
          <div className="who">
            <span className="avatar" aria-hidden>{initials}</span>
            <span><strong>{actor.full_name}</strong><br /><span className="hint">{actor.employee_code} · {role} · {actor.location_name}</span></span>
            {cookieMode()
              ? <form action={demoSignOut}><button className="btn ghost sm">Sign out</button></form>
              : <ClerkSignOut />}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}

async function ClerkSignOut() {
  const { SignOutButton } = await import('@clerk/nextjs');
  return <SignOutButton redirectUrl="/sign-in"><button className="btn ghost sm">Sign out</button></SignOutButton>;
}
