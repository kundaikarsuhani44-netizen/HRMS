import Link from 'next/link';
import { ActionForm, Field, Submit } from '@/components/ActionForm';
import { Denied } from '@/components/Denied';
import { MonthNav, parseMonth } from '@/components/MonthNav';
import { DayBadges, Legend } from '@/components/StatusBadge';
import { requireActor } from '@/lib/auth';
import { addDays, fmtTime, isoWeekday, todayIST } from '@/lib/ist';
import { sumContributions } from '@/lib/rules/dayStatus';
import { teamMonth, teamToday } from '@/lib/services/attendance';
import { hrCorrectAction } from '@/app/actions/attendance';

export const metadata = { title: 'Team attendance' };
const LETTER: Record<string, string> = { present: 'P', half_day: 'H', absent: 'A', on_leave: 'L', holiday: 'Ho', weekly_off: 'W', in_progress: '·', not_marked: '', future: '', not_employed: '' };

/** A6 — managers see direct reports; HR sees everyone. Employees are refused on the server. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string; view?: string }> }) {
  const actor = await requireActor();
  if (!actor.is_manager && !actor.is_hr_admin) return <Denied message="Team attendance is for managers (people with direct reports) and HR." />;
  const sp = await searchParams;
  const today = todayIST();
  const view = sp.view === 'month' ? 'month' : 'today';
  const { year, month } = parseMonth(sp, today);
  return (
    <>
      <div className="page-head">
        <div><h1>Team attendance</h1><span className="muted">{actor.is_hr_admin ? 'All active employees (HR)' : 'Your direct reports'}</span></div>
        <div className="tabs" style={{ border: 0, margin: 0 }}>
          <Link href="/team" className={view === 'today' ? 'active' : ''}>Today</Link>
          <Link href={`/team?view=month&y=${year}&m=${month}`} className={view === 'month' ? 'active' : ''}>Month grid</Link>
        </div>
      </div>
      {view === 'today' ? <Today actor={actor} /> : <Month actor={actor} year={year} month={month} />}
      {actor.is_hr_admin && <HrCorrection today={today} />}
    </>
  );
}

async function Today({ actor }: { actor: Awaited<ReturnType<typeof requireActor>> }) {
  const rows = await teamToday(actor);
  if (!rows.length) return <div className="card empty">No active team members.</div>;
  const order = ['absent', 'not_marked', 'on_leave', 'half_day', 'in_progress', 'present', 'holiday', 'weekly_off'];
  rows.sort((a, b) => order.indexOf(a.day.status) - order.indexOf(b.day.status) || a.emp.full_name.localeCompare(b.emp.full_name));
  return (
    <div className="table-wrap"><table className="t">
      <thead><tr><th>Employee</th><th>Location</th><th>Status today</th><th>In</th><th>Out</th><th></th></tr></thead>
      <tbody>{rows.map(({ emp, day, record }) => (
        <tr key={emp.id}>
          <td><strong>{emp.full_name}</strong><br /><span className="hint">{emp.employee_code} · {emp.designation}</span></td>
          <td>{emp.location_name}</td>
          <td><DayBadges day={day} /></td>
          <td>{record?.check_in ? fmtTime(record.check_in) : '—'}</td>
          <td>{record?.check_out ? fmtTime(record.check_out) : '—'}</td>
          <td><Link href={`/attendance?emp=${emp.id}`} className="btn ghost sm">Month →</Link></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

async function Month({ actor, year, month }: { actor: Awaited<ReturnType<typeof requireActor>>; year: number; month: number }) {
  const rows = await teamMonth(actor, year, month);
  const dates = rows[0]?.days.map((d) => d.date) ?? [];
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}><MonthNav base="/team" year={year} month={month} extra={{ view: 'month' }} /><Legend /></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="mgrid">
          <thead><tr><th className="name">Employee</th>{dates.map((d) => <th key={d} style={{ color: isoWeekday(d) === 7 ? 'var(--danger)' : undefined }}>{Number(d.slice(8))}</th>)}<th>P</th><th>LOP</th></tr></thead>
          <tbody>{rows.map(({ emp, days }) => {
            const t = sumContributions(days);
            return (
              <tr key={emp.id}>
                <th className="name"><Link href={`/attendance?emp=${emp.id}&y=${year}&m=${month}`}>{emp.full_name}</Link> <span className="hint">{emp.location_name}</span></th>
                {days.map((d) => <td key={d.date} className={d.status} title={`${d.date} ${d.status}${d.isLate ? ' Late' : ''}${d.isWfh ? ' WFH' : ''}`} style={d.isLate ? { boxShadow: 'inset 0 -3px 0 var(--st-late)' } : undefined}>{d.isWfh ? 'WH' : LETTER[d.status]}</td>)}
                <td style={{ fontWeight: 600 }}>{t.present}</td><td style={{ fontWeight: 600, color: 'var(--st-absent)' }}>{t.lopTotal}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>P Present · H Half day · A Absent · L Leave · Ho Holiday · W Weekly off · WH Work from home · orange underline = Late</p>
    </div>
  );
}

async function HrCorrection({ today }: { today: string }) {
  const { sql } = await import('@/lib/db');
  const emps = await sql<{ id: number; employee_code: string; full_name: string }[]>`select id, employee_code, full_name from employees where last_working_day is null or last_working_day >= ${today}::date order by full_name`;
  return (
    <details className="card more">
      <summary>HR: correct an attendance record</summary>
      <p className="hint" style={{ marginTop: 8 }}>For corrections without a regularisation request. A reason is mandatory; the old and new values go to the audit log.</p>
      <ActionForm action={hrCorrectAction} resetOnOk>
        <div className="form-grid">
          <Field name="employee_id" label="Employee" required><select id="employee_id" name="employee_id">{emps.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}</select></Field>
          <Field name="date" label="Date" required><input id="cdate" type="date" name="date" max={today} defaultValue={addDays(today, -1)} /></Field>
          <Field name="in" label="Check-in"><input id="cin" type="time" name="in" defaultValue="09:00" /></Field>
          <Field name="out" label="Check-out"><input id="cout" type="time" name="out" defaultValue="18:00" /></Field>
          <div className="field"><label className="check"><input type="checkbox" name="wfh" /> Mark as WFH instead</label></div>
          <Field name="reason" label="Reason" required><input id="creason" name="reason" /></Field>
        </div>
        <Submit>Save correction</Submit>
      </ActionForm>
    </details>
  );
}
