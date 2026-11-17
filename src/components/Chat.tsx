'use client';
import { useEffect, useRef, useState } from 'react';
import { confirmDraftAction, discardDraftAction } from '@/app/actions/leave';

type Call = { tool: string; ok: boolean };
type Draft = { kind: 'leave'; draftId: number; summary: string; state?: 'confirmed' | 'discarded' | 'error'; note?: string };
type Msg = { role: 'user' | 'assistant'; content: string; calls?: Call[]; drafts?: Draft[] };

const SUGGEST = ['How many CL do I have?', 'Leave Friday to Monday — kitne din lagenge?', 'kal ki chutti chahiye, kitni CL bachi hai?', 'What is the sandwich rule here?', 'Holidays this month?'];
const MGR = ['Who in my team is absent today?', 'Summarise my pending approvals', 'Run the month-end check for last month'];

export function Chat({ isManager, name }: { isManager: boolean; name: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ(''); setBusy(true);
    try {
      const r = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text, history }) });
      const j = await r.json();
      setMsgs((m) => [...m, { role: 'assistant', content: j.text ?? j.error ?? 'Error', calls: j.calls, drafts: j.drafts }]);
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Network error — please try again.' }]);
    } finally { setBusy(false); }
  }

  async function decide(mi: number, di: number, confirm: boolean) {
    const d = msgs[mi].drafts![di];
    const r = confirm ? await confirmDraftAction(d.draftId) : await discardDraftAction(d.draftId);
    setMsgs((m) => m.map((x, i) => i !== mi ? x : { ...x, drafts: x.drafts!.map((y, j) => j !== di ? y : { ...y, state: r?.ok ? (confirm ? 'confirmed' : 'discarded') : 'error', note: r?.message }) }));
  }

  return (
    <div className="chat">
      <div className="log" aria-live="polite">
        {msgs.length === 0 && (
          <div className="empty"><div className="icon">✦</div>Hi {name.split(' ')[0]}! Ask about your leave, holidays or policy — in English or Hinglish. I can prepare a leave request; you confirm it.</div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>
            {m.content}
            {m.drafts?.map((d, j) => (
              <div key={j} className="draft">
                <strong>Draft leave request</strong> — not submitted yet<br />{d.summary}
                <div className="row" style={{ marginTop: 8 }}>
                  {!d.state && <>
                    <button className="btn ok sm" onClick={() => decide(i, j, true)}>Confirm &amp; submit</button>
                    <button className="btn secondary sm" onClick={() => decide(i, j, false)}>Discard</button>
                  </>}
                  {d.state && <span className={`badge ${d.state === 'confirmed' ? 'approved' : d.state === 'error' ? 'rejected' : 'cancelled'}`}>{d.note ?? d.state}</span>}
                </div>
              </div>
            ))}
            {m.calls && m.calls.length > 0 && (
              <div className="tools" title="Tools the assistant called">
                <span className="hint">tools:</span>{m.calls.map((c, k) => <span key={k} className={`badge ${c.ok ? '' : 'fail'}`}>{c.tool}{c.ok ? '' : ' ✕'}</span>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg bot"><span className="hint">Thinking…</span></div>}
        <div ref={end} />
      </div>
      <div className="suggest" style={{ marginTop: 8 }}>
        {[...SUGGEST, ...(isManager ? MGR : [])].map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={busy}>{s}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask HR… e.g. kal ki chutti chahiye" aria-label="Message" maxLength={2000} />
        <button className="btn" disabled={busy || !q.trim()}>Send</button>
      </form>
    </div>
  );
}
