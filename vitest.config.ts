import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      '{shared,pipeline,electron}/src/**/__tests__/**/*.test.{ts,tsx}',
    ],
    // These specs instantiate better-sqlite3 / manipulate the filesystem.
    // Keep them isolated and sequential to avoid cross-test interference.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    environmentMatchGlobs: [['electron/src/renderer/**', 'jsdom']],
  },
});
