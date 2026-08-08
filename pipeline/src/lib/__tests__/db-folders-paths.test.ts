import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseFolderRepository } from '../db-folders';
import { createTestDb, seedFace, seedFolder, seedImage, type TestDb } from '../testing/test-db';

describe('DatabaseFolderRepository path handling', () => {
  let t: TestDb;
  let folders: DatabaseFolderRepository;

  beforeEach(() => {
    t = createTestDb();
    folders = new DatabaseFolderRepository(t.raw);
  });

  afterEach(() => {
    t.close();
  });

  it('counts images under Windows-style folder paths', () => {
    seedFolder(t, 'C:\\Photos');
    seedImage(t, 'C:\\Photos\\a.jpg', { fileSize: 10 });

    expect(folders.listFoldersWithStats()[0]).toMatchObject({
      path: 'C:\\Photos',
      image_count: 1,
      total_size: 10,
    });
  });

  it('finds the most specific Windows-style parent folder for a path', () => {
    seedFolder(t, 'C:\\Photos');
    seedFolder(t, 'C:\\Photos\\Trips');

    expect(folders.findFolderForPath('C:\\Photos\\Trips\\a.jpg')?.path).toBe('C:\\Photos\\Trips');
  });

  it('updates missing and face-scan rows under Windows-style folder paths', () => {
    seedFolder(t, 'C:\\Photos');
    const imageId = seedImage(t, 'C:\\Photos\\a.jpg', { facesScanned: true });
    seedFace(t, imageId);

    folders.markMissingByPathPrefix('C:/Photos/%', 'C:\\Photos');
    folders.markFacesUnscannedByPathPrefix('C:/Photos/%');
    folders.deleteFacesByImagePathPrefix('C:/Photos/%');

    expect(
      t.raw.prepare('SELECT missing, faces_scanned FROM images WHERE id = ?').get(imageId),
    ).toEqual({
      missing: 1,
      faces_scanned: 0,
    });
    expect(t.raw.prepare('SELECT COUNT(*) AS count FROM faces').get()).toEqual({ count: 0 });
  });
});
