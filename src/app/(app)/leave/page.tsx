import Link from 'next/link';
import { ActionForm, Submit } from '@/components/ActionForm';
import { RequestStatus } from '@/components/StatusBadge';
import { requireActor } from '@/lib/auth';
import { fmtDate, fmtDateTime, todayIST } from '@/lib/ist';
import { getBalances, myRequests } from '@/lib/services/leave';
import { cancelLeaveAction } from '@/app/actions/leave';

export const metadata = { title: 'My leave' };
const f = (n: number) => (n === Infinity ? '∞' : Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

/** L2 — opening, accrued, used, pending, available per type; L5 — cancel. */
export default async function MyLeave({ searchParams }: { searchParams: Promise<{ applied?: string; y?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const today = todayIST();
  const year = Number(sp.y) || Number(today.slice(0, 4));
  const [balances, reqs] = await Promise.all([getBalances(actor.id, year, today), myRequests(actor, 100)]);
  return (
    <>
      {sp.applied && <div className="alert ok">Leave request submitted. Your manager has been emailed. Your balance changes only when it is approved.</div>}
      <div className="page-head">
        <div><h1>My leave</h1><span className="muted">Leave year {year} (Jan–Dec) · as of {fmtDate(today)}</span></div>
        <Link href="/leave/apply" className="btn">+ Apply leave</Link>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        {balances.map((b) => (
          <div key={b.code} className="bal">
            <div className="row between"><span className="code">{b.code} · {b.name}</span>{b.half_day_allowed && <span className="hint">½ day ok</span>}</div>
            <div className="avail">{b.unlimited ? '∞' : f(b.available)} <small>{b.unlimited ? 'unpaid, unlimited' : 'available'}</small></div>
            {b.unlimited ? <dl><dt>Taken this year</dt><dd>{f(b.used)}</dd><dt>Pending</dt><dd>{f(b.pending)}</dd></dl> : (
              <dl>
                <dt>Opening (carried fwd)</dt><dd>{f(b.opening)}</dd>
                <dt>Accrued</dt><dd>+ {f(b.accrued)}</dd>
                {b.adjustment !== 0 && <><dt>HR adjustment</dt><dd>{b.adjustment > 0 ? '+' : ''}{f(b.adjustment)}</dd></>}
                <dt>Used (approved)</dt><dd>− {f(b.used)}</dd>
                <dt><strong>Available</strong></dt><dd><strong>{f(b.available)}</strong></dd>
                <dt>Pending approval</dt><dd>{f(b.pending)}</dd>
                <dt>Can apply now</dt><dd>{f(b.applicable)}</dd>
              </dl>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Request history</h2>
        {reqs.length === 0 ? <div className="empty"><div className="icon">🌴</div>No requests yet.</div> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Type</th><th>Dates</th><th className="num">Days</th><th>Reason</th><th>Status</th><th>Decision</th><th></th></tr></thead>
            <tbody>{reqs.map((r) => {
              const cancellable = r.status === 'pending' || (r.status === 'approved' && r.from_date > today);
              return (
                <tr key={r.id}>
                  <td><strong>{r.code}</strong>{r.created_via === 'agent' && <> <span className="badge wfh">via Ask HR</span></>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.from_date)}{r.to_date !== r.from_date && <> – {fmtDate(r.to_date)}</>}{r.is_half_day && ' (½)'}</td>
                  <td className="num">{r.days}{r.lop_days > 0 && <><br /><span className="hint">{r.lop_days} LOP</span></>}</td>
                  <td>{r.reason}{r.has_attachment && <><br /><a href={`/api/leave/${r.id}/attachment`} className="hint">📎 certificate</a></>}</td>
                  <td><RequestStatus status={r.status} /></td>
                  <td className="hint">{r.approver_name ? <>{r.approver_name}{r.approver_comment ? `: “${r.approver_comment}”` : ''}<br />{fmtDateTime(r.decided_at)}</> : r.submitted_at ? `Submitted ${fmtDateTime(r.submitted_at)}` : ''}</td>
                  <td>{cancellable && (
                    <ActionForm action={cancelLeaveAction}><input type="hidden" name="id" value={r.id} /><Submit className="btn danger secondary sm" pendingText="…">Cancel</Submit></ActionForm>
                  )}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
