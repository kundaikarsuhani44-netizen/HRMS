import { fmtTime, isoWeekday, todayIST } from '@/lib/ist';
import { STATUS_LABEL, type DayResult } from '@/lib/rules/dayStatus';
import type { AttendanceRow } from '@/lib/services/attendance';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A4 — month view, each day coloured by its computed status (DESIGN.md §4). */
export function AttendanceCalendar({ days, records }: { days: DayResult[]; records: Map<string, AttendanceRow> }) {
  const today = todayIST();
  const lead = days.length ? isoWeekday(days[0].date) - 1 : 0;
  return (
    <div className="cal" role="grid" aria-label="Attendance calendar">
      {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} className="day empty" />)}
      {days.map((d) => {
        const r = records.get(d.date);
        const label = d.status === 'holiday' ? (d.holidayName ?? 'Holiday') : STATUS_LABEL[d.status];
        const leaveCodes = d.leave.map((l) => (l.amount < 1 ? `½ ${l.code}` : l.code)).join(' + ');
        return (
          <div key={d.date} className={`day ${d.status} ${d.date === today ? 'today' : ''}`} role="gridcell"
            title={`${d.date}: ${label}${d.isLate ? ' · Late' : ''}${d.isWfh ? ' · WFH' : ''}`}>
            <span className="d">{Number(d.date.slice(8))}</span>
            {label && <span className="lbl">{d.status === 'on_leave' ? `Leave · ${leaveCodes}` : label}</span>}
            {d.isWfh && <span className="badge wfh" style={{ alignSelf: 'flex-start', padding: '0 5px' }}>WFH</span>}
            {d.isLate && <span className="badge late" style={{ alignSelf: 'flex-start', padding: '0 5px' }}>Late{d.lateCount && d.lateCount % 3 === 0 ? ' · ½ LOP' : ''}</span>}
            {d.missedPunch && <span className="extra" style={{ color: 'var(--st-absent)' }}>Missed punch</span>}
            {r?.check_in && !d.isWfh && <span className="tm">{fmtTime(r.check_in)}–{r.check_out ? fmtTime(r.check_out) : '…'}</span>}
            {d.optionalHoliday && <span className="extra hint">Opt: {d.optionalHoliday}</span>}
          </div>
        );
      })}
    </div>
  );
}
