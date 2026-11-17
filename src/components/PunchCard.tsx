'use client';
import { useActionState, useEffect, useState } from 'react';
import { checkInAction, checkOutAction, wfhAction } from '@/app/actions/attendance';
import type { ActionResult } from '@/lib/actionResult';

const clockFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

/** A1 — one-click check in / check out. The clock shows IST whatever the device's time zone is. */
export function PunchCard(props: {
  dateLabel: string; checkIn: string | null; checkOut: string | null; isWfh: boolean; isLate: boolean;
  dayKind: 'working' | 'weekly_off' | 'holiday' | 'on_leave'; dayNote?: string; statusLabel: string; hoursLabel?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const [inState, doIn, inPending] = useActionState<ActionResult>(checkInAction, null);
  const [outState, doOut, outPending] = useActionState<ActionResult>(checkOutAction, null);
  const [wfhState, doWfh, wfhPending] = useActionState<ActionResult, FormData>(wfhAction, null);
  const msg = outState ?? inState ?? wfhState;
  const off = props.dayKind !== 'working';
  return (
    <section className="punch" aria-label="Check in">
      <div className="row between">
        <div>
          <div className="clock" suppressHydrationWarning>{now ? clockFmt.format(now) : '—'}</div>
          <div className="date">{props.dateLabel} · IST</div>
        </div>
        <span className="badge">{props.statusLabel}</span>
      </div>
      {props.dayNote && <p style={{ color: '#ffe2c4', marginTop: 0 }}>{props.dayNote}</p>}
      <div className="row">
        {props.isWfh ? (
          <span style={{ fontSize: 16 }}>🏠 Working from home today — counts as Present.</span>
        ) : !props.checkIn ? (
          <form action={doIn}><button className="btn lg" disabled={inPending}>{inPending ? 'Checking in…' : 'Check in'}</button></form>
        ) : !props.checkOut ? (
          <form action={doOut}><button className="btn lg" disabled={outPending}>{outPending ? 'Checking out…' : 'Check out'}</button></form>
        ) : (
          <span style={{ fontSize: 16 }}>✓ Done for today{props.hoursLabel ? ` · ${props.hoursLabel}` : ''}</span>
        )}
        {!props.checkIn && !props.isWfh && !off && (
          <form action={doWfh}><input type="hidden" name="wfh" value="on" /><button className="btn secondary" disabled={wfhPending}>Work from home</button></form>
        )}
      </div>
      <div className="times">
        <div>Check in<b>{props.checkIn ?? '—'}</b></div>
        <div>Check out<b>{props.checkOut ?? '—'}</b></div>
        {props.isLate && <div>Status<b>Late</b></div>}
      </div>
      {msg?.message && <p role="status" style={{ marginTop: 12, marginBottom: 0, color: msg.ok ? '#d6f5e3' : '#ffd6d1', fontWeight: 600 }}>{msg.message}</p>}
    </section>
  );
}
