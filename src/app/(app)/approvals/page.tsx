import { ActionForm, Submit } from '@/components/ActionForm';
import { Denied } from '@/components/Denied';
import { requireActor } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/ist';
import { pendingRegularisations } from '@/lib/services/attendance';
import { pendingForApprover } from '@/lib/services/leave';
import { decideLeaveAction } from '@/app/actions/leave';
import { decideRegularisationAction } from '@/app/actions/attendance';

export const metadata = { title: 'Approvals' };

/** L4 + A5 — managers see their direct reports' requests; HR sees all. Nobody sees their own. */
export default async function Approvals() {
  const actor = await requireActor();
  if (!actor.is_manager && !actor.is_hr_admin) return <Denied message="The approvals inbox is for managers and HR." />;
  const [leave, regs] = await Promise.all([pendingForApprover(actor), pendingRegularisations(actor)]);
  return (
    <>
      <div className="page-head"><div><h1>Approvals</h1><span className="muted">{leave.length} leave · {regs.length} regularisation</span></div></div>
      <section className="card">
        <h2>Leave requests</h2>
        {leave.length === 0 ? <div className="empty"><div className="icon">✅</div>All caught up — no leave waiting for you.</div> : (
          <div className="stack">{leave.map((r) => {
            const paid = r.days - r.lop_days;
            const short = r.balance && !r.balance.unlimited && paid > r.balance.available;
            return (
              <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                <div className="row between">
                  <div><strong>{r.employee_name}</strong> <span className="hint">{r.employee_code} · {r.location_name}</span><br />
                    <span className="badge on_leave">{r.code}</span> {fmtDate(r.from_date)}{r.to_date !== r.from_date && ` – ${fmtDate(r.to_date)}`}{r.is_half_day && ' (½ day)'} · <strong>{r.days} day(s)</strong>{r.lop_days > 0 && ` (${r.lop_days} as LOP)`}
                  </div>
                  <span className="hint">Submitted {fmtDateTime(r.submitted_at)}{r.created_via === 'agent' ? ' via Ask HR' : ''}</span>
                </div>
                <p style={{ margin: '8px 0' }}>“{r.reason}”{r.has_attachment && <> · <a href={`/api/leave/${r.id}/attachment`}>📎 medical certificate</a></>}</p>
                <div className="row" style={{ gap: 6, marginBottom: 8 }}>
                  {r.balance && (r.balance.unlimited ? <span className="badge">LOP — unpaid</span> : <span className={`badge ${short ? 'absent' : 'present'}`}>{r.code} available {r.balance.available}{short ? ' — not enough' : ''}</span>)}
                  {r.clashes.length > 0 ? r.clashes.map((c, i) => <span key={i} className="badge late">Clash: {c.name} {fmtDate(c.from_date)}{c.to_date !== c.from_date ? `–${fmtDate(c.to_date)}` : ''} ({c.status})</span>) : <span className="badge">No team clashes</span>}
                </div>
                <ActionForm action={decideLeaveAction} className="row">
                  <input type="hidden" name="id" value={r.id} />
                  <input className="input" name="comment" aria-label="Comment" placeholder="Comment (required to reject)" style={{ flex: '1 1 240px', width: 'auto' }} />
                  <Submit className="btn ok" name="decision" value="approve" pendingText="…">Approve</Submit>
                  <Submit className="btn danger secondary" name="decision" value="reject" pendingText="…">Reject</Submit>
                </ActionForm>
              </div>
            );
          })}</div>
        )}
      </section>
      <section className="card">
        <h2>Attendance regularisation</h2>
        {regs.length === 0 ? <div className="empty"><div className="icon">✅</div>No regularisation requests waiting.</div> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Employee</th><th>Date</th><th>Recorded</th><th>Requested</th><th>Reason</th><th>Decision</th></tr></thead>
            <tbody>{regs.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.employee_name}</strong><br /><span className="hint">{r.employee_code}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td>{r.current_in ? fmtTime(r.current_in) : '—'} – {r.current_out ? fmtTime(r.current_out) : '—'}</td>
                <td><strong>{fmtTime(r.requested_in)} – {fmtTime(r.requested_out)}</strong></td>
                <td>{r.reason}</td>
                <td style={{ minWidth: 260 }}>
                  <ActionForm action={decideRegularisationAction} className="row">
                    <input type="hidden" name="id" value={r.id} />
                    <input className="input" name="comment" aria-label="Comment" placeholder="Comment" style={{ flex: '1 1 120px', width: 'auto', minHeight: 32 }} />
                    <Submit className="btn ok sm" name="decision" value="approve" pendingText="…">Approve</Submit>
                    <Submit className="btn danger secondary sm" name="decision" value="reject" pendingText="…">Reject</Submit>
                  </ActionForm>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
