import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/test-db';

describe('DatabaseImageRepository.upsertImage', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  const baseImage = {
    file_path: '/foo/bar/x.jpg',
    file_name: 'x.jpg',
    file_size: 1000,
    mime_type: 'image/jpeg',
    width: 100,
    height: 100,
    captured_at: null,
    latitude: null,
    longitude: null,
    city: null,
    country: null,
    description: null,
    favorite: false,
    hidden: false,
    missing: false,
    file_hash: 'hash-v1',
    dhash: null,
  };

  it('inserts a new row with created=true', () => {
    const result = testDb.manager.images.upsertImage(baseImage);
    expect(result.created).toBe(true);
    expect(result.fileHashMatched).toBe(false);
    expect(result.id).toBeGreaterThan(0);
  });

  it('preserves user-edited metadata and related-table rows on re-upsert', () => {
    const { id } = testDb.manager.images.upsertImage(baseImage);
    const { raw: db } = testDb;

    db.prepare("UPDATE images SET description='keep', favorite=1 WHERE id=?").run(id);
    db.prepare("INSERT INTO tags (name) VALUES ('sunset')").run();
    const tagId = (db.prepare("SELECT id FROM tags WHERE name='sunset'").get() as { id: number })
      .id;
    db.prepare('INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)').run(id, tagId);
    db.prepare("INSERT INTO collections (name) VALUES ('Trip')").run();
    const collectionId = (
      db.prepare("SELECT id FROM collections WHERE name='Trip'").get() as { id: number }
    ).id;
    db.prepare('INSERT INTO collection_images (collection_id, image_id) VALUES (?, ?)').run(
      collectionId,
      id,
    );

    const result2 = testDb.manager.images.upsertImage({
      ...baseImage,
      file_size: 2000,
      file_hash: 'hash-v2',
    });

    expect(result2.created).toBe(false);
    expect(result2.fileHashMatched).toBe(false);
    expect(result2.id).toBe(id);

    const row = db
      .prepare('SELECT description, favorite, file_size, file_hash FROM images WHERE id=?')
      .get(id) as { description: string; favorite: number; file_size: number; file_hash: string };
    expect(row.description).toBe('keep');
    expect(row.favorite).toBe(1);
    expect(row.file_size).toBe(2000);
    expect(row.file_hash).toBe('hash-v2');

    const tagCount = (
      db.prepare('SELECT COUNT(*) as c FROM image_tags WHERE image_id=?').get(id) as { c: number }
    ).c;
    expect(tagCount).toBe(1);

    const collectionCount = (
      db.prepare('SELECT COUNT(*) as c FROM collection_images WHERE image_id=?').get(id) as {
        c: number;
      }
    ).c;
    expect(collectionCount).toBe(1);
  });

  it('reports fileHashMatched=true when hash and size are unchanged', () => {
    testDb.manager.images.upsertImage(baseImage);
    const result2 = testDb.manager.images.upsertImage(baseImage);
    expect(result2.created).toBe(false);
    expect(result2.fileHashMatched).toBe(true);
  });

  it('reports fileHashMatched=false when size differs even if hash matches', () => {
    testDb.manager.images.upsertImage(baseImage);
    const result2 = testDb.manager.images.upsertImage({ ...baseImage, file_size: 9999 });
    expect(result2.fileHashMatched).toBe(false);
  });
});
