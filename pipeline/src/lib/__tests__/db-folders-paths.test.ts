import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseFolderRepository } from '../db-folders';
import { createTestDb, seedFace, seedFolder, seedImage, type TestDb } from '../testing/test-db';

describe('DatabaseFolderRepository path handling', () => {
  let t: TestDb;
  let folders: DatabaseFolderRepository;

  beforeEach(() => {
    t = createTestDb();
    folders = new DatabaseFolderRepository(t.raw, true);
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

    folders.markMissingUnderFolder('C:\\Photos');
    folders.markFacesUnscannedUnderFolder('C:\\Photos');
    folders.deleteFacesUnderFolder('C:\\Photos');

    expect(
      t.raw.prepare('SELECT missing, faces_scanned FROM images WHERE id = ?').get(imageId),
    ).toEqual({
      missing: 1,
      faces_scanned: 0,
    });
    expect(t.raw.prepare('SELECT COUNT(*) AS count FROM faces').get()).toEqual({ count: 0 });
  });

  it('clears missing rows under a folder given the folder path', () => {
    seedFolder(t, 'C:\\Photos');
    const imageId = seedImage(t, 'C:\\Photos\\a.jpg', { missing: true });

    folders.clearMissingUnderFolder('C:\\Photos');

    expect(t.raw.prepare('SELECT missing FROM images WHERE id = ?').get(imageId)).toEqual({
      missing: 0,
    });
  });

  it('does not mark images missing when another available folder still covers them', () => {
    seedFolder(t, '/foo');
    seedFolder(t, '/foo/bar');
    const outer = seedImage(t, '/foo/a.jpg');
    const inner = seedImage(t, '/foo/bar/b.jpg');

    folders.markMissingUnderFolder('/foo');

    expect(t.raw.prepare('SELECT missing FROM images WHERE id = ?').get(outer)).toEqual({
      missing: 1,
    });
    expect(t.raw.prepare('SELECT missing FROM images WHERE id = ?').get(inner)).toEqual({
      missing: 0,
    });
  });

  it('removes orphaned images and their palette vectors but keeps images covered by another folder', () => {
    seedFolder(t, '/foo');
    seedFolder(t, '/foo/bar');
    const orphanedImageId = seedImage(t, '/foo/a.jpg');
    const coveredImageId = seedImage(t, '/foo/bar/b.jpg');
    const orphanedColorId = Number(
      t.raw
        .prepare('INSERT INTO palette_colors (image_id, color_idx, weight) VALUES (?, 0, 1)')
        .run(orphanedImageId).lastInsertRowid,
    );
    const coveredColorId = Number(
      t.raw
        .prepare('INSERT INTO palette_colors (image_id, color_idx, weight) VALUES (?, 0, 1)')
        .run(coveredImageId).lastInsertRowid,
    );
    t.raw
      .prepare('INSERT INTO vec_palette (rowid, lab) VALUES (?, ?)')
      .run(BigInt(orphanedColorId), '[0,0,0]');
    t.raw
      .prepare('INSERT INTO vec_palette (rowid, lab) VALUES (?, ?)')
      .run(BigInt(coveredColorId), '[0,0,0]');

    folders.removeFolderAndOrphanedImages('/foo');

    expect(t.raw.prepare('SELECT id FROM images ORDER BY id').all()).toEqual([
      { id: coveredImageId },
    ]);
    expect(t.raw.prepare('SELECT image_id FROM palette_colors').all()).toEqual([
      { image_id: coveredImageId },
    ]);
    expect(t.raw.prepare('SELECT rowid FROM vec_palette').all()).toEqual([
      { rowid: coveredColorId },
    ]);
    expect(t.raw.prepare('SELECT path FROM folders ORDER BY path').all()).toEqual([
      { path: '/foo/bar' },
    ]);
  });

  it('classifies overlapping folders into parents and children', () => {
    seedFolder(t, '/foo');
    seedFolder(t, '/foo/bar');
    seedFolder(t, '/foo/bar/baz');
    seedFolder(t, '/unrelated');

    expect(folders.findOverlappingFolders('/foo/bar')).toEqual({
      parents: ['/foo'],
      children: ['/foo/bar/baz'],
    });
  });
});
