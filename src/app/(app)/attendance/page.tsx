import { ActionForm, Field, Submit } from '@/components/ActionForm';
import { AttendanceCalendar } from '@/components/AttendanceCalendar';
import { Denied } from '@/components/Denied';
import { MonthNav, parseMonth } from '@/components/MonthNav';
import { Legend, RequestStatus } from '@/components/StatusBadge';
import { requireActor } from '@/lib/auth';
import { addDays, fmtDate, fmtTime, istHHMM, todayIST } from '@/lib/ist';
import { AccessDenied } from '@/lib/services/actor';
import { monthFor, myRegularisations } from '@/lib/services/attendance';
import { regulariseAction, wfhAction } from '@/app/actions/attendance';

export const metadata = { title: 'My attendance' };
const f = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

export default async function MyAttendance({ searchParams }: { searchParams: Promise<{ y?: string; m?: string; emp?: string; date?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const today = todayIST();
  const { year, month } = parseMonth(sp, today);
  const employeeId = Number(sp.emp) || actor.id;
  let data;
  try { data = await monthFor(actor, employeeId, year, month); }
  catch (e) { if (e instanceof AccessDenied) return <Denied message={e.message} />; throw e; }
  const t = data.totals;
  const self = employeeId === actor.id;
  const regs = self ? await myRegularisations(actor) : [];
  const missed = self ? data.days.filter((d) => d.missedPunch || (d.status === 'absent' && d.date < today) || d.status === 'half_day') : [];
  const pre = sp.date ? data.records.get(sp.date) : undefined;

  return (
    <>
      <div className="page-head">
        <div><h1>{self ? 'My attendance' : data.emp.full_name}</h1><span className="muted">{data.emp.location_name} · all times IST</span></div>
        <MonthNav base="/attendance" year={year} month={month} extra={{ emp: self ? undefined : String(employeeId) }} />
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="label">Present</div><div className="value" style={{ color: 'var(--st-present)' }}>{f(t.present)}</div><div className="sub">{f(t.wfh)} WFH</div></div>
        <div className="stat"><div className="label">Leave</div><div className="value" style={{ color: 'var(--st-leave)' }}>{f(Object.values(t.leave).reduce((a, b) => a + b, 0))}</div><div className="sub">{Object.entries(t.leave).map(([k, v]) => `${k} ${f(v)}`).join(' · ') || 'none'}</div></div>
        <div className="stat"><div className="label">Late marks</div><div className="value" style={{ color: 'var(--st-late)' }}>{t.lateMarks}</div><div className="sub">every 3rd = ½ day LOP</div></div>
        <div className="stat"><div className="label">Loss of pay</div><div className="value" style={{ color: 'var(--st-absent)' }}>{f(t.lopTotal)}</div><div className="sub">absent {f(t.lopAbsent)} · late {f(t.lopLate)} · leave {f(t.lopLeave)}</div></div>
      </div>

      <div className="card">
        <AttendanceCalendar days={data.days} records={data.records} />
        <Legend />
      </div>

      {self && (
        <div className="grid grid-2">
          <div className="card" id="regularise">
            <h2>Request regularisation</h2>
            <p className="hint">Forgot to check in or out? Ask your manager to correct a past day (up to 30 days back). Attendance changes only after approval.</p>
            {missed.length > 0 && <p className="hint">Days that need attention: {missed.slice(-6).map((d) => <a key={d.date} href={`?y=${year}&m=${month}&date=${d.date}#regularise`} style={{ marginRight: 6 }}>{fmtDate(d.date)}</a>)}</p>}
            <ActionForm action={regulariseAction} resetOnOk>
              <div className="form-grid">
                <Field name="date" label="Date" required><input id="date" name="date" type="date" max={addDays(today, -1)} min={addDays(today, -30)} defaultValue={sp.date ?? ''} /></Field>
                <div />
                <Field name="in" label="Actual check-in" required><input id="in" name="in" type="time" defaultValue={pre?.check_in ? istHHMM(pre.check_in) : '09:00'} /></Field>
                <Field name="out" label="Actual check-out" required><input id="out" name="out" type="time" defaultValue={pre?.check_out ? istHHMM(pre.check_out) : '18:00'} /></Field>
                <Field name="reason" label="Reason" required className="span-2"><input id="reason" name="reason" placeholder="e.g. Forgot to check out after the evening shift" /></Field>
              </div>
              <Submit>Send to manager</Submit>
            </ActionForm>
          </div>
          <div className="card">
            <h2>Work from home on a past day</h2>
            <p className="hint">For today, use the button on Home. A WFH day counts as Present.</p>
            <ActionForm action={wfhAction}>
              <Field name="date" label="Date" required><input id="wdate" name="date" type="date" max={today} min={addDays(today, -30)} /></Field>
              <input type="hidden" name="wfh" value="on" />
              <Submit className="btn secondary">Mark WFH</Submit>
            </ActionForm>
            <h3 style={{ marginTop: 20 }}>My regularisation requests</h3>
            {regs.length === 0 ? <p className="hint">None yet.</p> : (
              <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Requested</th><th>Status</th></tr></thead>
                <tbody>{regs.map((r) => <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{fmtTime(r.requested_in)}–{fmtTime(r.requested_out)}<br /><span className="hint">{r.reason}</span>{r.approver_comment && <><br /><span className="hint">“{r.approver_comment}” — {r.approver_name}</span></>}</td><td><RequestStatus status={r.status} /></td></tr>)}</tbody></table></div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
