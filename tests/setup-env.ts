import { config } from 'dotenv';
config({ path: '.env.local', quiet: true } as never);
// Integration tests always use a separate database so `npm test` never touches demo data.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || (process.env.DATABASE_URL ?? '').replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');
(process.env as Record<string, string>).NODE_ENV = 'test';
