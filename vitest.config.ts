import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false, // integration tests share one database
    setupFiles: ['tests/setup-env.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
