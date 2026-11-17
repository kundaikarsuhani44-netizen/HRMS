/**
 * Runs during the Vercel build (`vercel-build`): applies new migrations, and seeds demo data
 * only if the database has no employees yet. Safe to run on every deploy.
 */
import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });
import postgres from 'postgres';
import { migrate } from './migrate';
import { seed } from './seed';

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set — add it in Vercel → Settings → Environment Variables.'); process.exit(1); }
  await migrate(url);
  const sql = postgres(url, { max: 1, prepare: false });
  const [{ n }] = await sql`select count(*)::int as n from employees`;
  await sql.end();
  if (n === 0) { console.log('Empty database — seeding demo data.'); await seed(url); }
  else console.log(`Database has ${n} employees — seed skipped.`);
})().catch((e) => { console.error(e); process.exit(1); });
