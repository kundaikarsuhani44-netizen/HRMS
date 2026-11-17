import Link from 'next/link';
import { PunchCard } from '@/components/PunchCard';
import { DayBadges, RequestStatus } from '@/components/StatusBadge';
import { requireActor } from '@/lib/auth';
import { fmtDate, fmtTime, todayIST } from '@/lib/ist';
import { STATUS_LABEL } from '@/lib/rules/dayStatus';
import { computeDays, teamToday, todayRecord } from '@/lib/services/attendance';
import { getBalances, myRequests, pendingForApprover } from '@/lib/services/leave';
import { pendingRegularisations } from '@/lib/services/attendance';

export const metadata = { title: 'Home' };
const f = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

export default async function Dashboard() {
  const actor = await requireActor();
  const today = todayIST();
  const [rec, balances, mine, days] = await Promise.all([
    todayRecord(actor.id), getBalances(actor.id), myRequests(actor, 6),
    computeDays([actor.id], `${today.slice(0, 7)}-01`, today, today),
  ]);
  const monthDays = days.get(actor.id)?.days ?? [];
  const todayDay = monthDays[monthDays.length - 1];
  const kind = todayDay?.status === 'holiday' ? 'holiday' : todayDay?.status === 'weekly_off' ? 'weekly_off' : todayDay?.status === 'on_leave' && todayDay.leave.reduce((s, l) => s + l.amount, 0) >= 1 ? 'on_leave' : 'working';
  const note = kind === 'holiday' ? `Holiday today: ${todayDay.holidayName}. No check-in needed.` : kind === 'weekly_off' ? 'Weekly off today for your location.' : kind === 'on_leave' ? 'You are on approved leave today. Punches will not change that.' : todayDay?.optionalHoliday ? `Optional holiday (${todayDay.optionalHoliday}) — a working day unless you take leave.` : undefined;
  const hours = rec?.check_in && rec.check_out ? (new Date(rec.check_out).getTime() - new Date(rec.check_in).getTime()) / 3.6e6 : null;
  const lates = monthDays.filter((d) => d.isLate).length;
  const approver = actor.is_hr_admin || actor.is_manager;
  const [team, pendingLeave, pendingReg] = approver ? await Promise.all([teamToday(actor), pendingForApprover(actor), pendingRegularisations(actor)]) : [[], [], []];
  const counts = { present: 0, on_leave: 0, absent: 0, not_marked: 0, off: 0 };
  for (const t of team) {
    if (['present', 'in_progress', 'half_day'].includes(t.day.status)) counts.present++;
    else if (t.day.status === 'on_leave') counts.on_leave++;
    else if (t.day.status === 'absent') counts.absent++;
    else if (t.day.status === 'not_marked') counts.not_marked++;
    else counts.off++;
  }
  const shown = balances.filter((b) => ['CL', 'SL', 'EL'].includes(b.code) || b.used > 0 || b.pending > 0);

  return (
    <>
      <div className="page-head">
        <div><h1>Namaste, {actor.full_name.split(' ')[0]}</h1><span className="muted">{actor.location_name} · {fmtDate(today)}</span></div>
        <Link href="/leave/apply" className="btn">+ Apply leave</Link>
      </div>

      <div className="hero">
        <PunchCard
          dateLabel={new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(today + 'T00:00:00Z'))}
          checkIn={rec?.check_in ? fmtTime(rec.check_in) : null} checkOut={rec?.check_out ? fmtTime(rec.check_out) : null}
          isWfh={!!rec?.is_wfh} isLate={!!rec?.is_late} dayKind={kind} dayNote={note}
          statusLabel={todayDay ? (STATUS_LABEL[todayDay.status] || 'Today') : 'Today'}
          hoursLabel={hours !== null ? `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m worked` : undefined}
        />
        <section className="card" style={{ marginBottom: 0 }}>
          <h2>This month <Link href="/attendance" className="btn ghost sm">Calendar →</Link></h2>
          <div className="grid grid-2">
            <div className="stat"><div className="label">Present</div><div className="value">{f(monthDays.reduce((s, d) => s + d.c.present, 0))}</div><div className="sub">incl. {f(monthDays.reduce((s, d) => s + d.c.wfh, 0))} WFH</div></div>
            <div className="stat"><div className="label">Late marks</div><div className="value" style={{ color: lates >= 3 ? 'var(--st-late)' : undefined }}>{lates}</div><div className="sub">{3 - (lates % 3)} more = ½ day LOP</div></div>
            <div className="stat"><div className="label">On leave</div><div className="value">{f(monthDays.reduce((s, d) => s + Object.values(d.c.leave).reduce((a, b) => a + b, 0), 0))}</div><div className="sub">days</div></div>
            <div className="stat"><div className="label">LOP so far</div><div className="value" style={{ color: 'var(--st-absent)' }}>{f(monthDays.reduce((s, d) => s + d.c.lopAbsent + d.c.lopLate + d.c.lopLeave, 0))}</div><div className="sub">days</div></div>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Leave balance {today.slice(0, 4)} <Link href="/leave" className="btn ghost sm">Details →</Link></h2>
        <div className="grid grid-4">
          {shown.map((b) => (
            <div key={b.code} className="bal">
              <div className="code">{b.code} · {b.name}</div>
              <div className="avail">{b.unlimited ? '∞' : f(b.available)} <small>{b.unlimited ? 'unpaid' : 'available'}</small></div>
              {!b.unlimited && b.pending > 0 && <div className="hint">{f(b.pending)} pending approval</div>}
            </div>
          ))}
        </div>
      </section>

      {approver && (
        <section className="card">
          <h2>My team today <Link href="/team" className="btn ghost sm">Team view →</Link></h2>
          {team.length === 0 ? <div className="empty">No active direct reports.</div> : (
            <>
              <div className="grid grid-4" style={{ marginBottom: 12 }}>
                <div className="stat"><div className="label">Present</div><div className="value" style={{ color: 'var(--st-present)' }}>{counts.present}</div></div>
                <div className="stat"><div className="label">On leave</div><div className="value" style={{ color: 'var(--st-leave)' }}>{counts.on_leave}</div></div>
                <div className="stat"><div className="label">Not checked in</div><div className="value">{counts.not_marked}</div></div>
                <div className="stat"><div className="label">Pending approvals</div><div className="value" style={{ color: 'var(--accent)' }}>{pendingLeave.length + pendingReg.length}</div><div className="sub"><Link href="/approvals">Open inbox</Link></div></div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {team.filter((t) => t.day.status === 'on_leave' || t.day.status === 'not_marked' || t.day.isLate).slice(0, 12).map((t) => (
                  <span key={t.emp.id} className="row" style={{ gap: 4, border: '1px solid var(--line)', borderRadius: 8, padding: '4px 8px', fontSize: 13 }}>
                    {t.emp.full_name} <DayBadges day={t.day} />
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>My recent requests <Link href="/leave" className="btn ghost sm">All →</Link></h2>
        {mine.length === 0 ? (
          <div className="empty"><div className="icon">🌴</div>No leave requests yet. <Link href="/leave/apply">Apply for leave</Link></div>
        ) : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Type</th><th>Dates</th><th className="num">Days</th><th>Status</th></tr></thead>
            <tbody>{mine.map((r) => (
              <tr key={r.id}><td>{r.code}</td><td>{fmtDate(r.from_date)}{r.to_date !== r.from_date ? ` – ${fmtDate(r.to_date)}` : ''}{r.is_half_day ? ' (½)' : ''}</td><td className="num">{r.days}</td><td><RequestStatus status={r.status} /></td></tr>
            ))}</tbody></table></div>
        )}
      </section>
    </>
  );
}
