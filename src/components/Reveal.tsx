'use client';
import { useState } from 'react';
import { revealAction } from '@/app/actions/employees';

/** HR-only. Fetches the unmasked value on click; the server writes an audit row for every reveal. */
export function Reveal({ employeeId, field, masked }: { employeeId: number; field: 'pan' | 'account_number'; masked: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 8, display: 'inline-flex' }}>
      <span className="mono">{value ?? masked}</span>
      {value ? (
        <button type="button" className="btn ghost sm" onClick={() => setValue(null)}>Hide</button>
      ) : (
        <button type="button" className="btn ghost sm" onClick={async () => {
          const r = await revealAction(employeeId, field);
          if (r?.ok) { setValue(String(r.data)); setTimeout(() => setValue(null), 30000); } else setErr(r?.message ?? 'Not allowed');
        }}>Reveal (logged)</button>
      )}
      {err && <span className="hint" style={{ color: 'var(--danger)' }}>{err}</span>}
    </span>
  );
}
