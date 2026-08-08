import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedFolder, seedImage, type TestDb } from 'pipeline';
import {
  OVERLAP_EXCLUDE_AVAILABLE_CLAUSE,
  OVERLAP_EXCLUDE_CLAUSE,
  pathPrefixLikePattern,
  sqlPath,
} from '../folder-overlap-sql';

// Regression tests for the NOT EXISTS clauses that scope folder removal and
// availability flips so overlapping folder registrations don't collateral-
// damage each other. The *real* statements in database.ts interpolate these
// constants; importing them here keeps test and implementation in lockstep.

describe('folder-overlap SQL', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    t.close();
  });

  const seed = () => {
    seedFolder(t, '/foo');
    seedFolder(t, '/foo/bar');
    seedImage(t, '/foo/a.jpg');
    seedImage(t, '/foo/bar/b.jpg');
  };

  it('removeFolder selection keeps images that another folder still covers', () => {
    seed();
    // Removing /foo: only delete images not covered by another folder.
    const rows = t.raw
      .prepare(
        `SELECT file_path FROM images WHERE ${sqlPath('file_path')} LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`,
      )
      .all('/foo/%', '/foo') as { file_path: string }[];
    expect(rows.map((r) => r.file_path)).toEqual(['/foo/a.jpg']);
  });

  it('removing the child folder leaves ALL images in place (parent still covers them)', () => {
    seed();
    // Removing /foo/bar: every image under /foo/bar/% is also under /foo/% via /foo.
    const rows = t.raw
      .prepare(`SELECT file_path FROM images WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`)
      .all('/foo/bar/%', '/foo/bar') as { file_path: string }[];
    expect(rows).toEqual([]);
  });

  it('availability flip does not mark siblings missing when another folder stays available', () => {
    seed();
    // /foo goes offline; /foo/bar stays available. Images under /foo/bar must
    // stay missing=0.
    t.raw
      .prepare(
        `UPDATE images SET missing = 1
         WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
      )
      .run('/foo/%', '/foo');

    const a = t.raw.prepare('SELECT missing FROM images WHERE file_path=?').get('/foo/a.jpg') as {
      missing: number;
    };
    const b = t.raw
      .prepare('SELECT missing FROM images WHERE file_path=?')
      .get('/foo/bar/b.jpg') as {
      missing: number;
    };
    expect(a.missing).toBe(1);
    expect(b.missing).toBe(0);
  });

  it('availability flip marks images missing when the overlapping folder is ALSO unavailable', () => {
    seed();
    t.raw.prepare('UPDATE folders SET available = 0 WHERE path = ?').run('/foo/bar');
    t.raw
      .prepare(
        `UPDATE images SET missing = 1
         WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
      )
      .run('/foo/%', '/foo');

    const b = t.raw
      .prepare('SELECT missing FROM images WHERE file_path=?')
      .get('/foo/bar/b.jpg') as {
      missing: number;
    };
    expect(b.missing).toBe(1);
  });

  it('non-overlapping folders behave as plain LIKE would', () => {
    seedFolder(t, '/a');
    seedFolder(t, '/b');
    seedImage(t, '/a/x.jpg');
    seedImage(t, '/b/y.jpg');

    const rows = t.raw
      .prepare(`SELECT file_path FROM images WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`)
      .all('/a/%', '/a') as { file_path: string }[];
    expect(rows.map((r) => r.file_path)).toEqual(['/a/x.jpg']);
  });

  it('removeFolder selection matches Windows-style paths', () => {
    seedFolder(t, 'C:\\Photos');
    seedImage(t, 'C:\\Photos\\a.jpg');

    const rows = t.raw
      .prepare(
        `SELECT file_path FROM images WHERE ${sqlPath('file_path')} LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`,
      )
      .all(pathPrefixLikePattern('C:\\Photos'), 'C:\\Photos') as { file_path: string }[];

    expect(rows.map((r) => r.file_path)).toEqual(['C:\\Photos\\a.jpg']);
  });
});
