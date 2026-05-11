import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { DatabaseFolderRepository } from '../db-folders';

describe('DatabaseFolderRepository path handling', () => {
  let db: DB;
  let folders: DatabaseFolderRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE folders (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        watched INTEGER DEFAULT 1,
        ignored INTEGER DEFAULT 0,
        exclude_from_face_scan INTEGER DEFAULT 0,
        available INTEGER DEFAULT 1,
        writable INTEGER DEFAULT 1,
        last_scanned TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE images (
        id INTEGER PRIMARY KEY,
        file_path TEXT UNIQUE NOT NULL,
        file_size INTEGER,
        hidden INTEGER DEFAULT 0,
        missing INTEGER DEFAULT 0,
        faces_scanned INTEGER DEFAULT 0,
        modified_at TEXT
      );
      CREATE TABLE faces (
        id INTEGER PRIMARY KEY,
        image_id INTEGER NOT NULL
      );
    `);
    folders = new DatabaseFolderRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('counts images under Windows-style folder paths', () => {
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('C:\\Photos');
    db.prepare('INSERT INTO images (file_path, file_size) VALUES (?, ?)').run(
      'C:\\Photos\\a.jpg',
      10,
    );

    expect(folders.listFoldersWithStats()[0]).toMatchObject({
      path: 'C:\\Photos',
      image_count: 1,
      total_size: 10,
    });
  });

  it('finds the most specific Windows-style parent folder for a path', () => {
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('C:\\Photos');
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('C:\\Photos\\Trips');

    expect(folders.findFolderForPath('C:\\Photos\\Trips\\a.jpg')?.path).toBe('C:\\Photos\\Trips');
  });

  it('updates missing and face-scan rows under Windows-style folder paths', () => {
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('C:\\Photos');
    db.prepare(
      'INSERT INTO images (id, file_path, missing, faces_scanned) VALUES (?, ?, ?, ?)',
    ).run(1, 'C:\\Photos\\a.jpg', 0, 1);
    db.prepare('INSERT INTO faces (image_id) VALUES (?)').run(1);

    folders.markMissingByPathPrefix('C:/Photos/%', 'C:\\Photos');
    folders.markFacesUnscannedByPathPrefix('C:/Photos/%');
    folders.deleteFacesByImagePathPrefix('C:/Photos/%');

    expect(db.prepare('SELECT missing, faces_scanned FROM images WHERE id = 1').get()).toEqual({
      missing: 1,
      faces_scanned: 0,
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM faces').get()).toEqual({ count: 0 });
  });
});
