'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ActionForm, Field, Submit } from './ActionForm';
import { applyLeaveAction, previewAction, type PreviewView } from '@/app/actions/leave';

type T = { id: number; code: string; name: string; half_day_allowed: boolean; available: number | null; applicable: number | null };
const wd = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const show = (d: string) => wd.format(new Date(d + 'T00:00:00Z'));

/** L3 — the form recomputes working days with the server's own rules as you type. */
export function ApplyLeaveForm({ types, today, minDate }: { types: T[]; today: string; minDate: string }) {
  const [typeId, setTypeId] = useState<number>(types[0]?.id ?? 0);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [half, setHalf] = useState(false);
  const [lop, setLop] = useState(false);
  const [p, setP] = useState<PreviewView | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);
  const t = types.find((x) => x.id === typeId);
  useEffect(() => {
    if (!typeId || !from) return;
    const n = ++seq.current;
    start(async () => {
      const r = await previewAction({ leave_type_id: typeId, from_date: from, to_date: half ? from : (to || from), is_half_day: half, reason: 'x', convert_excess_to_lop: lop });
      if (n === seq.current) setP(r);
    });
  }, [typeId, from, to, half, lop]);
  useEffect(() => { if (t && !t.half_day_allowed) setHalf(false); }, [t]);
  const insufficient = !!p?.lopOffer;
  const blocking = p?.errors.filter((e) => !e.startsWith('Insufficient')) ?? [];
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <ActionForm action={applyLeaveAction}>
          <Field name="leave_type_id" label="Leave type" required>
            <select id="leave_type_id" name="leave_type_id" value={typeId} onChange={(e) => { setTypeId(Number(e.target.value)); setLop(false); }}>
              {types.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name}{x.applicable !== null ? ` (can apply ${x.applicable})` : ''}</option>)}
            </select>
          </Field>
          {t?.half_day_allowed ? (
            <div className="field"><span style={{ fontSize: 13, fontWeight: 600 }}>Duration</span>
              <div className="seg" role="radiogroup" aria-label="Duration">
                <label><input type="radio" name="duration" value="full" checked={!half} onChange={() => setHalf(false)} />Full day(s)</label>
                <label><input type="radio" name="duration" value="half" checked={half} onChange={() => { setHalf(true); setTo(from); }} />Half day</label>
              </div>
            </div>
          ) : <input type="hidden" name="duration" value="full" />}
          <div className="form-grid">
            <Field name="from_date" label={half ? 'Date' : 'From'} required>
              <input id="from_date" type="date" name="from_date" min={minDate} value={from} onChange={(e) => { setFrom(e.target.value); if (half || !to || to < e.target.value) setTo(e.target.value); }} />
            </Field>
            {!half ? (
              <Field name="to_date" label="To" required><input id="to_date" type="date" name="to_date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            ) : <input type="hidden" name="to_date" value={from} />}
          </div>
          <Field name="reason" label="Reason" required><textarea id="reason" name="reason" placeholder="A few words for your manager" maxLength={300} /></Field>
          {p?.needsCertificate && (
            <Field name="certificate" label={`Medical certificate (required: ${p.typeCode} over ${p.certificateAfter} days)`} required help="PDF, JPG or PNG, up to 2 MB">
              <input id="certificate" type="file" name="certificate" accept="application/pdf,image/jpeg,image/png" />
            </Field>
          )}
          {insufficient && (
            <div className="alert warn">
              Not enough {p?.typeCode}: you can use <strong>{p?.lopOffer!.paid}</strong> of {p?.days} day(s).
              <label className="check" style={{ marginTop: 8 }}>
                <input type="checkbox" name="convert_excess_to_lop" checked={lop} onChange={(e) => setLop(e.target.checked)} />
                Convert the excess <strong>{p?.lopOffer!.lop}</strong> day(s) to Loss of Pay
              </label>
            </div>
          )}
          <Submit pendingText="Submitting…">Submit for approval</Submit>
        </ActionForm>
      </div>
      <div className="card" aria-live="polite">
        <h2>Summary {pending && <span className="hint">updating…</span>}</h2>
        {!p ? <div className="skeleton" style={{ height: 120 }} /> : (
          <>
            <div className="grid grid-2">
              <div className="stat"><div className="label">Leave days</div><div className="value">{p.days}</div><div className="sub">working days only</div></div>
              <div className="stat"><div className="label">{p.typeCode} available</div><div className="value">{p.balance?.unlimited ? '∞' : p.balance?.available ?? '—'}</div><div className="sub">{p.balance && !p.balance.unlimited ? `${p.balance.pending} pending · can apply ${p.balance.applicable}` : 'unpaid'}</div></div>
            </div>
            {p.days > 0 && !blocking.length && (
              <p style={{ marginTop: 12 }}>
                {p.lop > 0 && p.typeCode !== 'LOP' ? <>Paid <strong>{p.paid}</strong> + Loss of Pay <strong>{p.lop}</strong>. </> : null}
                {p.balance && !p.balance.unlimited && !insufficient && <>After approval you will have <strong>{+((p.balance.available ?? 0) - p.days).toFixed(2)}</strong> {p.typeCode} left.</>}
              </p>
            )}
            {p.dates.length > 0 && <p className="hint">Counted: {p.dates.map((d) => show(d.date) + (d.amount < 1 ? ' (½)' : '')).join(', ')}</p>}
            {p.excluded.length > 0 && (
              <div className="alert info">Not counted (no sandwich rule):<br />{p.excluded.map((e) => <span key={e.date}>{show(e.date)} — {e.why}<br /></span>)}</div>
            )}
            {blocking.map((e) => <div key={e} className="alert error">{e}</div>)}
          </>
        )}
      </div>
    </div>
  );
}
