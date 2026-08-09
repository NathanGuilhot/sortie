import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mostSpecificFolderForPath } from 'shared';
import { DatabaseFolderRepository } from '../db-folders';
import { createTestDb, seedFolder, type TestDb } from '../testing/test-db';

// The SQL "which folder covers this path" (db-folders.findFolderForPath) and
// the pure JS one (shared/library-paths.mostSpecificFolderForPath, used by the
// renderer) must agree — this table pins them together across the separator
// spellings that caused regression dd339e3.

const FOLDERS = ['/photos', '/photos/trips', 'C:\\Photos', 'C:\\Photos\\Trips', '/pho'];

const CASES: Array<{ filePath: string; expected: string | null }> = [
  { filePath: '/photos/a.jpg', expected: '/photos' },
  { filePath: '/photos/trips/b.jpg', expected: '/photos/trips' },
  { filePath: '/photos/trips', expected: '/photos/trips' },
  { filePath: '/photosuffix/c.jpg', expected: null },
  { filePath: '/elsewhere/d.jpg', expected: null },
  { filePath: 'C:\\Photos\\a.jpg', expected: 'C:\\Photos' },
  { filePath: 'C:\\Photos\\Trips\\b.jpg', expected: 'C:\\Photos\\Trips' },
  { filePath: 'C:/Photos/Trips/c.jpg', expected: 'C:\\Photos\\Trips' },
];

describe('folder-covers-path parity (SQL vs JS)', () => {
  let t: TestDb;
  let repo: DatabaseFolderRepository;

  beforeEach(() => {
    t = createTestDb();
    for (const folder of FOLDERS) seedFolder(t, folder);
    repo = new DatabaseFolderRepository(t.raw, true);
  });

  afterEach(() => {
    t.close();
  });

  const folderObjects = FOLDERS.map((path) => ({ path }));

  for (const { filePath, expected } of CASES) {
    it(`agrees on ${JSON.stringify(filePath)}`, () => {
      const sqlResult = repo.findFolderForPath(filePath)?.path ?? null;
      const jsResult = mostSpecificFolderForPath(folderObjects, filePath)?.path ?? null;

      expect(sqlResult).toBe(expected);
      expect(jsResult).toBe(expected);
    });
  }
});
