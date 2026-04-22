import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'pipeline/src/**/__tests__/**/*.test.ts',
      'electron/src/**/__tests__/**/*.test.ts',
    ],
    // These specs instantiate better-sqlite3 / manipulate the filesystem.
    // Keep them isolated and sequential to avoid cross-test interference.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
