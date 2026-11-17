'use client';
import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/actionResult';

const Ctx = createContext<ActionResult>(null);
export const useFormResult = () => useContext(Ctx);

/** A form bound to a server action. Shows the action's message and passes field errors to <Field>. */
export function ActionForm({
  action, children, className, resetOnOk = false, showOk = true, id, encType,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode; className?: string; resetOnOk?: boolean; showOk?: boolean; id?: string; encType?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnOk) ref.current?.reset(); }, [state, resetOnOk]);
  return (
    <Ctx.Provider value={state}>
      <form ref={ref} action={formAction} className={className} id={id} encType={encType} noValidate>
        {state?.message && (state.ok ? showOk : true) && (
          <div className={`alert ${state.ok ? 'ok' : 'error'}`} role={state.ok ? 'status' : 'alert'}>{state.message}</div>
        )}
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function Field({
  name, label, required, help, children, className,
}: { name: string; label: string; required?: boolean; help?: string; children: ReactNode; className?: string }) {
  const err = useFormResult()?.errors?.[name];
  return (
    <div className={`field ${err ? 'has-error' : ''} ${className ?? ''}`}>
      <label htmlFor={name}>{label}{required && <span className="req"> *</span>}</label>
      {children}
      {err ? <span className="error" id={`${name}-error`}>{err}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  );
}

export function Submit({ children, className = 'btn', pendingText, name, value, formNoValidate }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string; formNoValidate?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} name={name} value={value} formNoValidate={formNoValidate}>{pending ? pendingText ?? 'Saving…' : children}</button>;
}
