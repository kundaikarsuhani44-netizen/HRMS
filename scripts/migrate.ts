/**
 * Apply db/migrations/*.sql in order, once each.  `--reset` drops every Kinara table first
 * (asks for confirmation unless --yes is given or the database is local).
 *   npm run db:migrate
 *   npm run db:reset           (migrate --reset + seed)
 */
import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import postgres from 'postgres';

const TABLES = [
  'agent_log', 'email_log', 'audit_log', 'policy_documents', 'leave_attachments', 'leave_requests', 'leave_balances',
  'leave_types', 'regularisation_requests', 'attendance', 'holidays', 'employee_bank', 'employee_statutory',
  'employees', 'departments', 'locations', 'schema_migrations',
];

export async function migrate(url: string, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (opts.reset) {
      await sql.unsafe(`drop table if exists ${TABLES.join(', ')} cascade;
        drop sequence if exists employee_code_seq;
        drop function if exists forbid_employee_code_change() cascade;
        drop function if exists forbid_reporting_cycle() cascade;`);
      if (!opts.quiet) console.log('Dropped existing Kinara tables.');
    }
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(process.cwd(), 'db', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync(path.join(dir, f), 'utf8'));
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      if (!opts.quiet) console.log(`Applied ${f}`);
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const reset = process.argv.includes('--reset');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    if (reset && !local && !process.argv.includes('--yes')) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ans = await rl.question('This DELETES all HRMS data in a REMOTE database. Type "reset" to continue: ');
      rl.close();
      if (ans.trim() !== 'reset') { console.log('Aborted.'); process.exit(1); }
    }
    await migrate(url, { reset });
    console.log('Migrations complete.');
  })().catch((e) => { console.error(e); process.exit(1); });
}
