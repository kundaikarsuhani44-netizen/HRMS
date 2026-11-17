import Link from 'next/link';
import { ActionForm, Field, Submit } from '@/components/ActionForm';
import { Denied } from '@/components/Denied';
import { requireActor } from '@/lib/auth';
import { sql } from '@/lib/db';
import { fmtDate, fmtDateTime, todayIST } from '@/lib/ist';
import { listHolidays } from '@/lib/services/calendar';
import { departments, locations } from '@/lib/services/employees';
import { leaveTypes } from '@/lib/services/leave';
import { emailLog, policies } from '@/lib/services/settings';
import {
  addDepartmentAction, addHolidayAction, deleteHolidayAction, rolloverAction, saveLeaveTypeAction,
  saveLocationAction, savePolicyAction, sendDraftEmailAction,
} from '@/app/actions/settings';

export const metadata = { title: 'Settings' };
const TABS = [['holidays', 'Holidays'], ['leave-types', 'Leave types'], ['locations', 'Locations & departments'], ['policy', 'Policy text'], ['email', 'Email'], ['agent', 'Agent log']] as const;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function Settings({ searchParams }: { searchParams: Promise<{ tab?: string; y?: string }> }) {
  const actor = await requireActor();
  if (!actor.is_hr_admin) return <Denied message="Settings are for HR Admin only." />;
  const sp = await searchParams;
  const tab = sp.tab ?? 'holidays';
  const year = Number(sp.y) || Number(todayIST().slice(0, 4));
  const locs = await locations();
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><span className="muted">Every change here is written to the audit log.</span></div></div>
      <nav className="tabs">{TABS.map(([k, l]) => <Link key={k} href={`/settings?tab=${k}`} className={tab === k ? 'active' : ''}>{l}</Link>)}</nav>

      {tab === 'holidays' && <Holidays year={year} locs={locs} />}
      {tab === 'leave-types' && <LeaveTypes year={year} />}
      {tab === 'locations' && <Locations locs={locs} />}
      {tab === 'policy' && <Policy />}
      {tab === 'email' && <Email />}
      {tab === 'agent' && <AgentLog />}
    </>
  );
}

async function Holidays({ year, locs }: { year: number; locs: Awaited<ReturnType<typeof locations>> }) {
  const hols = await listHolidays({ year });
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h2>Holidays {year} <span className="row" style={{ gap: 4 }}><Link className="btn secondary sm" href={`/settings?tab=holidays&y=${year - 1}`}>‹</Link><Link className="btn secondary sm" href={`/settings?tab=holidays&y=${year + 1}`}>›</Link></span></h2>
        {hols.length === 0 ? <div className="empty">No holidays configured for {year}.</div> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Location</th><th></th></tr></thead>
            <tbody>{hols.map((h) => (
              <tr key={h.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(h.date)}</td><td>{h.name}</td><td><span className={`badge ${h.type === 'Optional' ? '' : 'holiday'}`}>{h.type}</span></td><td>{h.location_name}</td>
                <td><ActionForm action={deleteHolidayAction} showOk={false}><input type="hidden" name="id" value={h.id} /><Submit className="btn ghost sm" pendingText="…">Remove</Submit></ActionForm></td></tr>
            ))}</tbody></table></div>
        )}
      </div>
      <div className="card">
        <h2>Add holiday</h2>
        <ActionForm action={addHolidayAction} resetOnOk>
          <Field name="date" label="Date" required><input id="hdate" type="date" name="date" /></Field>
          <Field name="name" label="Name" required><input id="hname" name="name" placeholder="e.g. Ganesh Chaturthi" /></Field>
          <Field name="type" label="Type" required help="National & State = paid day off. Optional (restricted) = working day; employees may take leave.">
            <select id="htype" name="type"><option>National</option><option>State</option><option>Optional</option></select>
          </Field>
          <div className="field"><label>Applies to</label>{locs.map((l) => <label key={l.id} className="check"><input type="checkbox" name="location_ids" value={l.id} defaultChecked /> {l.name}</label>)}</div>
          <Submit>Add holiday</Submit>
        </ActionForm>
      </div>
    </div>
  );
}

async function LeaveTypes({ year }: { year: number }) {
  const types = await leaveTypes();
  return (
    <>
      {types.map((t) => (
        <details key={t.id} className="card more">
          <summary>{t.code} — {t.name} · {t.annual_quota ?? 'unlimited'}{t.accrual_method === 'monthly' ? ` (${t.monthly_rate}/month)` : ''} · carry fwd {t.carry_forward_max} · half day {t.half_day_allowed ? 'yes' : 'no'}{!t.is_active && ' · inactive'}</summary>
          <LeaveTypeForm t={t} />
        </details>
      ))}
      <details className="card more"><summary>+ Add leave type</summary><LeaveTypeForm /></details>
      <div className="card">
        <h2>Year-end carry forward</h2>
        <p className="hint">Copies each employee&apos;s closing balance into next year&apos;s opening, up to the carry-forward limit (EL ≤ 30; CL and SL lapse). Safe to re-run.</p>
        <ActionForm action={rolloverAction} className="row"><input type="hidden" name="year" value={year} /><Submit className="btn secondary">Carry forward {year} → {year + 1}</Submit></ActionForm>
      </div>
    </>
  );
}

function LeaveTypeForm({ t }: { t?: Awaited<ReturnType<typeof leaveTypes>>[number] }) {
  return (
    <ActionForm action={saveLeaveTypeAction}>
      <input type="hidden" name="id" value={t?.id ?? ''} />
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field name="code" label="Code" required><input name="code" defaultValue={t?.code} maxLength={5} /></Field>
        <Field name="name" label="Name" required><input name="name" defaultValue={t?.name} /></Field>
        <Field name="annual_quota" label="Annual quota (days)" help="Blank = unlimited (LOP)"><input name="annual_quota" type="number" step="0.5" defaultValue={t?.annual_quota ?? ''} /></Field>
        <Field name="accrual_method" label="Accrual method" required>
          <select name="accrual_method" defaultValue={t?.accrual_method ?? 'annual_prorata'}>
            <option value="annual_prorata">Credited 1 Jan, pro-rated for joiners</option><option value="monthly">Monthly per completed month</option>
            <option value="on_request">On request (statutory/event)</option><option value="none">None (unlimited, unpaid)</option>
          </select>
        </Field>
        <Field name="monthly_rate" label="Monthly rate" help="Only for monthly accrual"><input name="monthly_rate" type="number" step="0.01" defaultValue={t?.monthly_rate ?? ''} /></Field>
        <Field name="carry_forward_max" label="Carry-forward limit" help="0 = lapses on 31 Dec"><input name="carry_forward_max" type="number" step="0.5" defaultValue={t?.carry_forward_max ?? 0} /></Field>
        <Field name="certificate_after_days" label="Certificate needed above (days)"><input name="certificate_after_days" type="number" step="0.5" defaultValue={t?.certificate_after_days ?? ''} /></Field>
        <Field name="eligible_gender" label="Eligible"><select name="eligible_gender" defaultValue={t?.eligible_gender ?? ''}><option value="">Everyone</option><option>Female</option><option>Male</option></select></Field>
        <label className="check"><input type="checkbox" name="half_day_allowed" defaultChecked={t?.half_day_allowed} /> Half day allowed</label>
        <label className="check"><input type="checkbox" name="is_paid" defaultChecked={t?.is_paid ?? true} /> Paid</label>
        <label className="check"><input type="checkbox" name="counts_calendar_days" defaultChecked={t?.counts_calendar_days} /> Counts calendar days (e.g. maternity)</label>
        <label className="check"><input type="checkbox" name="is_active" defaultChecked={t?.is_active ?? true} /> Active</label>
      </div>
      <div style={{ marginTop: 12 }}><Submit>Save</Submit></div>
    </ActionForm>
  );
}

async function Locations({ locs }: { locs: Awaited<ReturnType<typeof locations>> }) {
  const depts = await departments();
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div>
        {locs.map((l) => (
          <div className="card" key={l.id}>
            <h2>{l.name}</h2>
            <ActionForm action={saveLocationAction}>
              <input type="hidden" name="id" value={l.id} />
              <div className="form-grid">
                <Field name="name" label="Name"><input name="name" defaultValue={l.name} /></Field>
                <Field name="short_name" label="Short name"><input name="short_name" defaultValue={l.short_name} /></Field>
                <Field name="city" label="City"><input name="city" defaultValue={l.city} /></Field>
                <Field name="state" label="State"><input name="state" defaultValue={l.state} /></Field>
              </div>
              <div className="field"><label>Weekly offs</label><div className="row">{DOW.map((d, i) => <label key={d} className="check"><input type="checkbox" name="weekly_off_days" value={i + 1} defaultChecked={l.weekly_off_days.map(Number).includes(i + 1)} />{d}</label>)}</div></div>
              <Submit className="btn secondary">Save location</Submit>
            </ActionForm>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Departments</h2>
        <ul>{depts.map((d) => <li key={d.id}>{d.name}</li>)}</ul>
        <ActionForm action={addDepartmentAction} resetOnOk className="row"><input className="input" name="name" placeholder="New department" style={{ flex: 1, width: 'auto' }} aria-label="Department name" /><Submit>Add</Submit></ActionForm>
      </div>
    </div>
  );
}

async function Policy() {
  const docs = await policies();
  return (
    <>{docs.map((d) => (
      <div className="card" key={d.slug}>
        <h2>{d.title} <span className="hint">updated {fmtDateTime(d.updated_at)}</span></h2>
        <p className="hint">The Ask HR assistant answers policy questions only from this text.</p>
        <ActionForm action={savePolicyAction}>
          <input type="hidden" name="slug" value={d.slug} />
          <div className="field"><textarea name="body" defaultValue={d.body} style={{ minHeight: 320, fontSize: 13 }} aria-label={d.title} /></div>
          <Submit>Save policy</Submit>
        </ActionForm>
      </div>
    ))}</>
  );
}

async function Email() {
  const rows = await emailLog(80);
  return (
    <div className="card">
      <h2>Email log</h2>
      <p className="hint">Notifications for new leave requests and decisions. “logged_only” = no SMTP configured. Drafts come from the assistant&apos;s month-end check and are sent only when HR clicks Send.</p>
      {rows.length === 0 ? <div className="empty">No emails yet.</div> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</td><td>{e.to_email}</td>
              <td><details><summary>{e.subject}</summary><div className="pre">{e.body}</div></details>{e.error && <span className="hint" style={{ color: 'var(--danger)' }}>{e.error}</span>}</td>
              <td><span className={`badge ${e.status === 'sent' ? 'approved' : e.status === 'failed' ? 'rejected' : e.status === 'draft' ? 'pending' : ''}`}>{e.status}</span></td>
              <td>{e.status === 'draft' && (
                <ActionForm action={sendDraftEmailAction} className="row"><input type="hidden" name="id" value={e.id} />
                  <Submit className="btn ok sm" name="decision" value="send" pendingText="…">Send</Submit>
                  <Submit className="btn ghost sm" name="decision" value="discard" pendingText="…">Discard</Submit></ActionForm>
              )}</td></tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

async function AgentLog() {
  const rows = await sql<{ id: number; full_name: string; question: string | null; tool: string; inputs: unknown; result: unknown; ok: boolean; created_at: Date }[]>`
    select a.id, e.full_name, a.question, a.tool, a.inputs, a.result, a.ok, a.created_at from agent_log a join employees e on e.id = a.employee_id order by a.id desc limit 100`;
  return (
    <div className="card">
      <h2>Agent log</h2>
      <p className="hint">Every tool call the assistant made: user, tool, inputs, result, time.</p>
      {rows.length === 0 ? <div className="empty">No assistant activity yet.</div> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>User</th><th>Question</th><th>Tool</th><th>Inputs → result</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td><td>{r.full_name}</td><td>{r.question}</td>
              <td><code>{r.tool}</code> {!r.ok && <span className="badge rejected">refused</span>}</td>
              <td><details><summary className="mono" style={{ fontSize: 12 }}>{JSON.stringify(r.inputs)}</summary><div className="pre">{JSON.stringify(r.result, null, 2)}</div></details></td></tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}
