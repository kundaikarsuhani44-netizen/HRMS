import { RuleError } from './db';
import { AccessDenied } from './services/actor';

export type ActionResult = { ok: boolean; message?: string; errors?: Record<string, string>; data?: unknown } | null;

/** Run a server-action body; turn rule / access errors into a message instead of a crash page. */
export async function attempt(fn: () => Promise<ActionResult | void>, okMessage?: string): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true, message: okMessage };
  } catch (e) {
    if (e instanceof RuleError || e instanceof AccessDenied) return { ok: false, message: e.message };
    // redirect() / notFound() throw special errors that must propagate
    if ((e as { digest?: string })?.digest?.startsWith?.('NEXT_')) throw e;
    console.error(e);
    return { ok: false, message: 'Something went wrong. Please try again.' };
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const num = (fd: FormData, k: string) => { const v = fd.get(k); return v === null || v === '' ? NaN : Number(v); };
export const bool = (fd: FormData, k: string) => ['on', 'true', '1'].includes(String(fd.get(k) ?? ''));
