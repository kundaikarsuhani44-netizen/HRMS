import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, Field, Submit } from '@/components/ActionForm';
import { Denied } from '@/components/Denied';
import { ProfileView } from '@/components/ProfileView';
import { requireActor } from '@/lib/auth';
import { todayIST } from '@/lib/ist';
import { auditFor } from '@/lib/services/audit';
import { getEmployee } from '@/lib/services/employees';
import { deactivateAction, reactivateAction } from '@/app/actions/employees';

export const metadata = { title: 'Employee' };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string; saved?: string }> }) {
  const actor = await requireActor();
  const id = Number((await params).id);
  const sp = await searchParams;
  // URL tampering: an employee opening /employees/<someone else> is refused before anything is read.
  if (!actor.is_hr_admin && id !== actor.id) return <Denied message="You can only view your own profile." />;
  if (!actor.is_hr_admin) return <Denied message="Open your profile from “My profile”." />;
  const res = Number.isInteger(id) ? await getEmployee(actor, id) : null;
  if (!res) notFound();
  const { emp, sensitive } = res;
  const audit = await auditFor(['employees', 'employee_statutory', 'employee_bank'], id, 100);
  const tab = sp.tab ?? 'personal';
  return (
    <>
      {sp.created && <div className="alert ok">Employee created with code <strong className="mono">{emp.employee_code}</strong>. They can sign in with {emp.email}.</div>}
      {sp.saved && <div className="alert ok">Changes saved. Job and statutory changes are in the audit trail.</div>}
      <div className="page-head">
        <div className="row"><span className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{emp.full_name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
          <div><h1>{emp.full_name}</h1><span className="muted"><span className="mono">{emp.employee_code}</span> · {emp.designation} · {emp.location_name}</span></div></div>
        <div className="row"><Link href="/employees" className="btn secondary">‹ Directory</Link><Link href={`/employees/${id}/edit`} className="btn">Edit</Link></div>
      </div>
      <div className="card">
        <ProfileView emp={emp} s={sensitive} tab={tab} base={`/employees/${id}`} canReveal audit={audit} extraTabs={[{ key: 'exit', label: emp.is_active ? 'Exit' : 'Reactivate' }]} />
        {tab === 'exit' && (emp.is_active ? (
          <ActionForm action={deactivateAction.bind(null, id)}>
            <p className="muted">E6 — set the last working day. From the next day the employee cannot sign in. The record is never deleted; pending leave after that date is cancelled.</p>
            <div className="form-grid">
              <Field name="last_working_day" label="Last working day" required><input id="last_working_day" type="date" name="last_working_day" defaultValue={todayIST()} /></Field>
              <Field name="reason" label="Reason" required><input id="reason" name="reason" placeholder="Resignation / end of contract…" /></Field>
            </div>
            <Submit className="btn danger">Set last working day</Submit>
          </ActionForm>
        ) : (
          <ActionForm action={reactivateAction.bind(null, id)}>
            <p className="muted">This employee exited on {emp.last_working_day}. Reactivating clears the last working day.</p>
            <Field name="reason" label="Reason" required><input id="reason" name="reason" /></Field>
            <Submit className="btn secondary">Reactivate</Submit>
          </ActionForm>
        ))}
      </div>
    </>
  );
}
