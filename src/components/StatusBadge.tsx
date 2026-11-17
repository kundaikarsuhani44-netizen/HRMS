import { STATUS_LABEL, type DayResult, type DayStatus } from '@/lib/rules/dayStatus';

export function StatusBadge({ status, label }: { status: DayStatus | string; label?: string }) {
  return <span className={`badge ${status}`}>{label ?? STATUS_LABEL[status as DayStatus] ?? status}</span>;
}

/** Badges for one computed day: status + WFH + Late (same rendering on every screen). */
export function DayBadges({ day }: { day: DayResult }) {
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      <StatusBadge status={day.status} label={day.status === 'holiday' ? `Holiday${day.holidayName ? ` · ${day.holidayName}` : ''}` : undefined} />
      {day.isWfh && <span className="badge wfh">WFH</span>}
      {day.isLate && <span className="badge late">Late{day.lateCount ? ` #${day.lateCount}` : ''}</span>}
      {day.missedPunch && <span className="badge absent">Missed punch</span>}
    </span>
  );
}

export function RequestStatus({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export const LEGEND: { status: string; label: string }[] = [
  { status: 'present', label: 'Present' }, { status: 'half_day', label: 'Half Day' }, { status: 'absent', label: 'Absent' },
  { status: 'on_leave', label: 'On Leave' }, { status: 'holiday', label: 'Holiday' }, { status: 'weekly_off', label: 'Weekly Off' },
  { status: 'late', label: 'Late' }, { status: 'wfh', label: 'WFH' },
];

export function Legend() {
  return <div className="legend">{LEGEND.map((l) => <span key={l.status} className={`badge ${l.status}`}>{l.label}</span>)}</div>;
}
