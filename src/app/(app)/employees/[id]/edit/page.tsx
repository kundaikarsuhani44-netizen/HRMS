import { notFound } from 'next/navigation';
import { Denied } from '@/components/Denied';
import { EmployeeForm } from '@/components/EmployeeForm';
import { requireActor } from '@/lib/auth';
import { departments, getEmployee, locations, managerOptions } from '@/lib/services/employees';
import { updateEmployeeAction } from '@/app/actions/employees';

export const metadata = { title: 'Edit employee' };

export default async function EditEmployee({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor.is_hr_admin) return <Denied message="Only HR Admin can edit job and statutory details." />;
  const id = Number((await params).id);
  const res = Number.isInteger(id) ? await getEmployee(actor, id) : null;
  if (!res) notFound();
  const { emp, sensitive: s } = res;
  const [d, l, m] = await Promise.all([departments(), locations(), managerOptions()]);
  return (
    <>
      <div className="page-head"><div><h1>Edit {emp.full_name}</h1><span className="muted mono">{emp.employee_code}</span></div></div>
      <div className="card">
        <EmployeeForm action={updateEmployeeAction.bind(null, id)} mode="edit"
          values={{ ...emp, uan: s.uan, ifsc: s.ifsc, bank_name: s.bank_name, masked: { pan: s.pan, aadhaar: s.aadhaar, account: s.account } }}
          departments={d.map((x) => ({ id: x.id, label: x.name }))} locations={l.map((x) => ({ id: x.id, label: x.name }))}
          managers={m.filter((x) => x.id !== id).map((x) => ({ id: x.id, label: `${x.full_name} (${x.employee_code}) — ${x.designation}` }))} />
      </div>
    </>
  );
}
