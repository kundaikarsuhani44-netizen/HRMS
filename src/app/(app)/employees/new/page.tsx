import { Denied } from '@/components/Denied';
import { EmployeeForm } from '@/components/EmployeeForm';
import { requireActor } from '@/lib/auth';
import { departments, locations, managerOptions } from '@/lib/services/employees';
import { createEmployeeAction } from '@/app/actions/employees';

export const metadata = { title: 'Add employee' };

export default async function NewEmployee() {
  const actor = await requireActor();
  if (!actor.is_hr_admin) return <Denied message="Only HR Admin can add employees." />;
  const [d, l, m] = await Promise.all([departments(), locations(), managerOptions()]);
  return (
    <>
      <div className="page-head"><div><h1>Add employee</h1><span className="muted">The employee code (KCF####) is generated automatically and never changes.</span></div></div>
      <div className="card">
        <EmployeeForm action={createEmployeeAction} mode="create" values={{ state: 'Goa' }}
          departments={d.map((x) => ({ id: x.id, label: x.name }))} locations={l.map((x) => ({ id: x.id, label: x.name }))}
          managers={m.map((x) => ({ id: x.id, label: `${x.full_name} (${x.employee_code}) — ${x.designation}` }))} />
      </div>
    </>
  );
}
