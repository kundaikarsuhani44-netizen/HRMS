import { Denied } from '@/components/Denied';
import { MonthNav, parseMonth } from '@/components/MonthNav';
import { requireActor } from '@/lib/auth';
import { fmtDate, todayIST } from '@/lib/ist';
import { monthEndSummary } from '@/lib/services/reports';

export const metadata = { title: 'Reports' };

/** L8 — month-end summary for payroll. Managers: own team. HR: all. Statutory fields masked. */
export default async function Reports({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const actor = await requireActor();
  if (!actor.is_manager && !actor.is_hr_admin) return <Denied message="Reports are for managers and HR." />;
  const { year, month } = parseMonth(await searchParams, todayIST());
  const { rows, codes, start, end } = await monthEndSummary(actor, year, month);
  return (
    <>
      <div className="page-head">
        <div><h1>Month-end summary</h1><span className="muted">{fmtDate(start)} – {fmtDate(end)} · {actor.is_hr_admin ? 'all employees' : 'your team'} · days after today are not counted yet</span></div>
        <div className="row"><MonthNav base="/reports" year={year} month={month} /><a className="btn" href={`/api/reports/month-end?y=${year}&m=${month}`}>⇩ Download CSV</a></div>
      </div>
      {rows.length === 0 ? <div className="card empty"><div className="icon">📄</div>No employees in scope for this month.</div> : (
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Code</th><th>Name</th><th>Loc</th><th className="num">Present</th><th className="num">WFH</th>{codes.map((c) => <th key={c} className="num">{c}</th>)}<th className="num">LOP</th><th className="num">Late</th><th className="num">Missed</th><th className="num">Hol</th><th className="num">W/Off</th><th>Aadhaar</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.employee_code}>
              <td className="mono">{r.employee_code}</td><td>{r.full_name}</td><td>{r.location}</td>
              <td className="num">{r.days_present}</td><td className="num">{r.wfh_days}</td>
              {codes.map((c) => <td key={c} className="num">{r.leave[c] || ''}</td>)}
              <td className="num" style={{ color: r.lop_days ? 'var(--st-absent)' : undefined }} title={`leave ${r.lop_leave} · absent ${r.lop_absent} · late ${r.lop_late}`}>{r.lop_days}</td>
              <td className="num">{r.late_marks}</td><td className="num">{r.missed_punches}</td><td className="num">{r.holidays}</td><td className="num">{r.weekly_offs}</td>
              <td className="mono">{r.aadhaar_masked}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="hint" style={{ marginTop: 8 }}>LOP = LOP leave + absent/half days + ½ day per 3 Late marks. Hover the LOP figure for the split.</p>
    </>
  );
}
