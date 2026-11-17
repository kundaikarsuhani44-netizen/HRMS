'use client';
import { useActionState, useState } from 'react';
import { passwordSignIn } from '@/app/actions/auth';
import type { ActionResult } from '@/lib/actionResult';

const ROLES = [
  { key: 'hr', label: 'HR Admin', icon: '⚙', hint: 'Full access: employees, settings, reports' },
  { key: 'manager', label: 'Manager', icon: '☷', hint: 'Your team, approvals, reports' },
  { key: 'employee', label: 'Employee', icon: '☺', hint: 'Check in, leave, your profile' },
] as const;

export function LoginForm() {
  const [role, setRole] = useState<(typeof ROLES)[number]['key']>('employee');
  const [state, action, pending] = useActionState<ActionResult, FormData>(passwordSignIn, null);
  const [show, setShow] = useState(false);
  const current = ROLES.find((r) => r.key === role)!;
  return (
    <form action={action} className="login">
      <div className="role-tabs" role="tablist" aria-label="Sign in as">
        {ROLES.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={role === r.key} className={role === r.key ? 'active' : ''} onClick={() => setRole(r.key)}>
            <span aria-hidden className="ic">{r.icon}</span>{r.label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: '4px 0 16px' }}>{current.hint}</p>
      <input type="hidden" name="role" value={role} />
      {state?.message && <div className="alert error" role="alert">{state.message}</div>}
      <div className="field">
        <label htmlFor="login">Employee code or email</label>
        <input id="login" name="login" autoComplete="username" placeholder="e.g. KCF0012" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required style={{ flex: 1 }} />
          <button type="button" className="btn secondary" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      <button className="btn lg block" disabled={pending}>{pending ? 'Signing in…' : `Sign in as ${current.label}`}</button>
    </form>
  );
}
