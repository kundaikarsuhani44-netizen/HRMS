import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __kinaraSql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  return postgres(url, {
    max: process.env.NODE_ENV === 'production' ? 5 : 10,
    prepare: false, // required for Supabase's transaction pooler (port 6543)
    idle_timeout: 20,
    connection: { TimeZone: 'Asia/Kolkata', application_name: 'kinara-hrms' },
    types: {
      // Return DATE columns as 'YYYY-MM-DD' strings. A JS Date would be shifted by the
      // server's local time zone — exactly the bug we must never have.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      // NUMERIC → number (balances are small decimals like 4.5 or 1.25)
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
    onnotice: () => {},
  });
}

export const sql: postgres.Sql = globalThis.__kinaraSql ?? (globalThis.__kinaraSql = create());

export type Tx = postgres.TransactionSql | postgres.Sql;

/** A user-facing business rule violation (shown to the user as-is). */
export class RuleError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** Translate known Postgres constraint errors into readable messages. */
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  if (err?.code === '23505') {
    if (err.constraint_name?.includes('email')) return 'Another employee already uses this email address.';
    if (err.constraint_name?.includes('pan')) return 'This PAN is already registered to another employee.';
    if (err.constraint_name?.includes('aadhaar')) return 'This Aadhaar is already registered to another employee.';
    if (err.constraint_name?.includes('regularisation')) return 'You already have a pending regularisation for this date.';
    if (err.constraint_name?.includes('holidays')) return 'A holiday already exists on this date for this location.';
    return 'This record already exists.';
  }
  if (err?.code === '23P01') return 'You already have a pending or approved leave request overlapping these dates.';
  if (err?.code === '23514' && err.message?.includes('reporting cycle'))
    return 'That reporting manager would create a cycle (someone would end up reporting to themselves).';
  if (err?.code === '23514') return 'One of the values is not valid.';
  return err?.message ?? 'Something went wrong.';
}
