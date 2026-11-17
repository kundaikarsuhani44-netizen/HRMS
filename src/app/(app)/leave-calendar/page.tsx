import { Denied } from '@/components/Denied';
import { MonthNav, parseMonth } from '@/components/MonthNav';
import { requireActor } from '@/lib/auth';
import { daysBetweenInclusive, isoWeekday, monthBounds, todayIST } from '@/lib/ist';
import { teamLeaveCalendar } from '@/lib/services/leave';

export const metadata = { title: 'Leave calendar' };

/** L7 — team leave on a month grid; a date with 2+ people off is highlighted as a clash. */
export default async function LeaveCalendar({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const actor = await requireActor();
  if (!actor.is_manager && !actor.is_hr_admin) return <Denied message="The team leave calendar is for managers and HR." />;
  const { year, month } = parseMonth(await searchParams, todayIST());
  const reqs = await teamLeaveCalendar(actor, year, month);
  const { start, end } = monthBounds(year, month);
  const dates = daysBetweenInclusive(start, end);
  const people = [...new Map(reqs.map((r) => [r.employee_id, r.employee_name])).entries()];
  const offOn = (empId: number, d: string) => reqs.find((r) => r.employee_id === empId && r.from_date <= d && r.to_date >= d);
  const countOn = (d: string) => new Set(reqs.filter((r) => r.from_date <= d && r.to_date >= d).map((r) => r.employee_id)).size;
  return (
    <>
      <div className="page-head">
        <div><h1>Leave calendar</h1><span className="muted">{actor.is_hr_admin ? 'Everyone' : 'Your direct reports'} · approved and pending</span></div>
        <MonthNav base="/leave-calendar" year={year} month={month} />
      </div>
      <div className="card">
        {people.length === 0 ? <div className="empty"><div className="icon">📅</div>No leave this month.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="mgrid">
              <thead><tr><th className="name">Employee</th>{dates.map((d) => <th key={d} style={{ color: countOn(d) > 1 ? 'var(--accent)' : isoWeekday(d) === 7 ? 'var(--danger)' : undefined }}>{Number(d.slice(8))}</th>)}</tr></thead>
              <tbody>{people.map(([id, name]) => (
                <tr key={id}><th className="name">{name}</th>{dates.map((d) => {
                  const r = offOn(id, d);
                  return (
                    <td key={d} className={r ? `on_leave ${countOn(d) > 1 ? 'clash' : ''}` : 'future'}
                      style={r?.status === 'pending' ? { opacity: 0.55, outline: '1px dashed var(--st-leave)' } : undefined}
                      title={r ? `${name}: ${r.code} (${r.status})` : ''}>{r ? r.code : ''}</td>
                  );
                })}</tr>
              ))}</tbody>
            </table>
            <p className="hint" style={{ marginTop: 8 }}>Solid = approved, faded = pending. Orange date / outline = two or more people off on the same day (clash). The bar spans the requested dates; weekly offs and holidays inside it are not counted as leave.</p>
          </div>
        )}
      </div>
    </>
  );
}
