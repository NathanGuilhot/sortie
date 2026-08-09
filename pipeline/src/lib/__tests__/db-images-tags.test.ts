import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, seedImage, type TestDb } from '../testing/test-db';

describe('DatabaseTagRepository.setUserTags', () => {
  let testDb: TestDb | null = null;

  afterEach(() => {
    testDb?.close();
    testDb = null;
  });

  it('replaces user tags, preserves existing tag positions, and removes stale user links', () => {
    testDb = createTestDb();
    const imageId = seedImage(testDb, '/photos/a.jpg');
    const raw = testDb.raw;

    raw.prepare("INSERT INTO tags (name, category) VALUES ('machine', 'auto')").run();
    const machineTagId = (
      raw.prepare("SELECT id FROM tags WHERE name = 'machine'").get() as { id: number }
    ).id;
    raw
      .prepare(
        "INSERT INTO image_tags (image_id, tag_id, source, position) VALUES (?, ?, 'auto', 7)",
      )
      .run(imageId, machineTagId);

    testDb.manager.tags.setUserTags(imageId, ['one', 'two']);
    testDb.manager.tags.setUserTags(imageId, ['two', 'three']);

    expect(
      raw
        .prepare(
          `SELECT t.name, it.source, it.position
           FROM image_tags it JOIN tags t ON t.id = it.tag_id
           WHERE it.image_id = ? ORDER BY t.name`,
        )
        .all(imageId),
    ).toEqual([
      { name: 'machine', source: 'auto', position: 7 },
      { name: 'three', source: 'user', position: 0 },
      { name: 'two', source: 'user', position: 0 },
    ]);
  });
});

describe('DatabaseImageRepository.getImageIdByPath', () => {
  let testDb: TestDb | null = null;

  afterEach(() => {
    testDb?.close();
    testDb = null;
  });

  it('finds a Windows path through forward-slash spelling', () => {
    testDb = createTestDb();
    const imageId = seedImage(testDb, 'C:\\Photos\\a.jpg');

    expect(testDb.manager.images.getImageIdByPath('C:/Photos/a.jpg')).toBe(imageId);
  });
});
