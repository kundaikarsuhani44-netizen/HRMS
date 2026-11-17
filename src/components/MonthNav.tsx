import Link from 'next/link';
import { MONTHS } from '@/lib/ist';

/** ‹ November 2026 › links that keep other query params. */
export function MonthNav({ base, year, month, extra = {} }: { base: string; year: number; month: number; extra?: Record<string, string | undefined> }) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const q = (y: number, m: number) => {
    const p = new URLSearchParams(Object.entries({ ...extra, y: String(y), m: String(m) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${p}`;
  };
  return (
    <div className="row" style={{ gap: 4 }}>
      <Link className="btn secondary sm" href={q(prev.y, prev.m)} aria-label="Previous month">‹</Link>
      <strong style={{ minWidth: 140, textAlign: 'center' }}>{MONTHS[month - 1]} {year}</strong>
      <Link className="btn secondary sm" href={q(next.y, next.m)} aria-label="Next month">›</Link>
    </div>
  );
}

export function parseMonth(sp: { y?: string; m?: string }, today: string) {
  const y = Number(sp.y) || Number(today.slice(0, 4));
  const m = Number(sp.m) || Number(today.slice(5, 7));
  return { year: Math.min(2100, Math.max(2000, y)), month: Math.min(12, Math.max(1, m)) };
}
