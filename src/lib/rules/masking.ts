/** E7 — masking. Applied on the server before any value leaves for the browser or a CSV. */

/** ABCDE1234F → ABCDE****F */
export function maskPan(pan: string | null | undefined): string {
  if (!pan) return '—';
  if (pan.length !== 10) return '**********';
  return `${pan.slice(0, 5)}****${pan.slice(9)}`;
}

/** 123412341234 → XXXX XXXX 1234 */
export function maskAadhaar(aadhaar: string | null | undefined): string {
  if (!aadhaar) return '—';
  return `XXXX XXXX ${aadhaar.slice(-4)}`;
}

/** 50100012345678 → XXXXXXXXXX5678 (only the last 4 digits are ever visible) */
export function maskAccount(acc: string | null | undefined): string {
  if (!acc) return '—';
  return `${'X'.repeat(Math.max(acc.length - 4, 4))}${acc.slice(-4)}`;
}
