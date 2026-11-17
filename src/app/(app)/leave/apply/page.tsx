import { ApplyLeaveForm } from '@/components/ApplyLeaveForm';
import { requireActor } from '@/lib/auth';
import { addDays, todayIST } from '@/lib/ist';
import { getBalances, MAX_BACKDATE_DAYS } from '@/lib/services/leave';

export const metadata = { title: 'Apply leave' };

export default async function ApplyLeave() {
  const actor = await requireActor();
  const today = todayIST();
  const bals = await getBalances(actor.id);
  return (
    <>
      <div className="page-head"><div><h1>Apply for leave</h1><span className="muted">{actor.location_name}: weekly offs and holidays are not counted.</span></div></div>
      <ApplyLeaveForm today={today} minDate={addDays(today, -MAX_BACKDATE_DAYS)}
        types={bals.map((b) => ({ id: b.leave_type_id, code: b.code, name: b.name, half_day_allowed: b.half_day_allowed, available: b.unlimited ? null : b.available, applicable: b.unlimited ? null : b.applicable }))} />
    </>
  );
}
