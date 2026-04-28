import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { OVERLAP_EXCLUDE_CLAUSE, OVERLAP_EXCLUDE_AVAILABLE_CLAUSE } from '../folder-overlap-sql';

// Regression tests for the NOT EXISTS clauses that scope folder removal and
// availability flips so overlapping folder registrations don't collateral-
// damage each other. The *real* statements in database.ts interpolate these
// constants; importing them here keeps test and implementation in lockstep.

describe('folder-overlap SQL', () => {
  let db: DB;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE folders (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        available INTEGER DEFAULT 1
      );
      CREATE TABLE images (
        id INTEGER PRIMARY KEY,
        file_path TEXT UNIQUE NOT NULL,
        missing INTEGER DEFAULT 0
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  const seed = () => {
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('/foo');
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('/foo/bar');
    db.prepare('INSERT INTO images (file_path) VALUES (?)').run('/foo/a.jpg');
    db.prepare('INSERT INTO images (file_path) VALUES (?)').run('/foo/bar/b.jpg');
  };

  it('removeFolder selection keeps images that another folder still covers', () => {
    seed();
    // Removing /foo: only delete images not covered by another folder.
    const rows = db
      .prepare(`SELECT file_path FROM images WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`)
      .all('/foo/%', '/foo') as { file_path: string }[];
    expect(rows.map((r) => r.file_path)).toEqual(['/foo/a.jpg']);
  });

  it('removing the child folder leaves ALL images in place (parent still covers them)', () => {
    seed();
    // Removing /foo/bar: every image under /foo/bar/% is also under /foo/% via /foo.
    const rows = db
      .prepare(`SELECT file_path FROM images WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`)
      .all('/foo/bar/%', '/foo/bar') as { file_path: string }[];
    expect(rows).toEqual([]);
  });

  it('availability flip does not mark siblings missing when another folder stays available', () => {
    seed();
    // /foo goes offline; /foo/bar stays available. Images under /foo/bar must
    // stay missing=0.
    db.prepare(
      `UPDATE images SET missing = 1
       WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
    ).run('/foo/%', '/foo');

    const a = db.prepare('SELECT missing FROM images WHERE file_path=?').get('/foo/a.jpg') as {
      missing: number;
    };
    const b = db.prepare('SELECT missing FROM images WHERE file_path=?').get('/foo/bar/b.jpg') as {
      missing: number;
    };
    expect(a.missing).toBe(1);
    expect(b.missing).toBe(0);
  });

  it('availability flip marks images missing when the overlapping folder is ALSO unavailable', () => {
    seed();
    db.prepare('UPDATE folders SET available = 0 WHERE path = ?').run('/foo/bar');
    db.prepare(
      `UPDATE images SET missing = 1
       WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
    ).run('/foo/%', '/foo');

    const b = db.prepare('SELECT missing FROM images WHERE file_path=?').get('/foo/bar/b.jpg') as {
      missing: number;
    };
    expect(b.missing).toBe(1);
  });

  it('non-overlapping folders behave as plain LIKE would', () => {
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('/a');
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('/b');
    db.prepare('INSERT INTO images (file_path) VALUES (?)').run('/a/x.jpg');
    db.prepare('INSERT INTO images (file_path) VALUES (?)').run('/b/y.jpg');

    const rows = db
      .prepare(`SELECT file_path FROM images WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`)
      .all('/a/%', '/a') as { file_path: string }[];
    expect(rows.map((r) => r.file_path)).toEqual(['/a/x.jpg']);
  });
});
