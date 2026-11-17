import Link from 'next/link';
import { Denied } from '@/components/Denied';
import { requireActor } from '@/lib/auth';
import { fmtDate } from '@/lib/ist';
import { departments, listEmployees, locations } from '@/lib/services/employees';

export const metadata = { title: 'Employees' };

/** E2 — directory. HR only; checked here on the server, not just by hiding the menu item. */
export default async function Directory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  if (!actor.is_hr_admin) return <Denied message="The employee directory is for HR Admin only." />;
  const sp = await searchParams;
  const status = (['active', 'inactive', 'all'].includes(sp.status ?? '') ? sp.status : 'active') as 'active' | 'inactive' | 'all';
  const [rows, depts, locs] = await Promise.all([
    listEmployees(actor, { q: sp.q, departmentId: Number(sp.dept) || undefined, locationId: Number(sp.loc) || undefined, status }),
    departments(), locations(),
  ]);
  return (
    <>
      <div className="page-head">
        <div><h1>Employees</h1><span className="muted">{rows.length} {status === 'all' ? '' : status} employee{rows.length === 1 ? '' : 's'}</span></div>
        <Link href="/employees/new" className="btn">+ Add employee</Link>
      </div>
      <form className="filters card" style={{ padding: 12 }}>
        <div className="field" style={{ flex: '2 1 220px' }}><label htmlFor="q">Search</label><input id="q" name="q" placeholder="Name, code or email" defaultValue={sp.q} /></div>
        <div className="field"><label htmlFor="dept">Department</label><select id="dept" name="dept" defaultValue={sp.dept ?? ''}><option value="">All</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div className="field"><label htmlFor="loc">Location</label><select id="loc" name="loc" defaultValue={sp.loc ?? ''}><option value="">All</option>{locs.map((d) => <option key={d.id} value={d.id}>{d.short_name}</option>)}</select></div>
        <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></div>
        <button className="btn secondary">Filter</button>
      </form>
      {rows.length === 0 ? <div className="card empty"><div className="icon">🔎</div>No employees match these filters.</div> : (
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Location</th><th>Manager</th><th>Joined</th><th>Status</th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id} className={e.is_active ? '' : 'inactive'}>
              <td className="mono">{e.employee_code}</td>
              <td><Link href={`/employees/${e.id}`}><strong>{e.full_name}</strong></Link>{e.is_hr_admin && <> <span className="badge hr">HR</span></>}<br /><span className="hint">{e.email}</span></td>
              <td>{e.designation}</td><td>{e.department_name}</td><td>{e.location_name}</td><td>{e.manager_name ?? '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.date_of_joining)}</td>
              <td>{e.is_active ? <span className="badge present">Active</span> : <span className="badge absent">Exited {fmtDate(e.last_working_day)}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
