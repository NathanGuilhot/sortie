import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, seedImage, type TestDb } from '../testing/test-db';

describe('DatabaseBoardRepository', () => {
  let testDb: TestDb | undefined;

  afterEach(() => {
    testDb?.close();
    testDb = undefined;
  });

  function setupBoard() {
    testDb = createTestDb();
    const tagId = Number(
      testDb.raw.prepare("INSERT INTO tags (name, category) VALUES ('Board', 'user')").run()
        .lastInsertRowid,
    );
    return { manager: testDb.manager, raw: testDb.raw, tagId };
  }

  it('reorders board image positions according to the supplied order', () => {
    const { manager, raw, tagId } = setupBoard();
    const first = seedImage(testDb!, '/library/first.jpg');
    const second = seedImage(testDb!, '/library/second.jpg');
    const third = seedImage(testDb!, '/library/third.jpg');
    const insert = raw.prepare(
      "INSERT INTO image_tags (image_id, tag_id, source, position) VALUES (?, ?, 'user', ?)",
    );
    insert.run(first, tagId, 2);
    insert.run(second, tagId, 1);
    insert.run(third, tagId, 0);

    manager.boards.reorderBoardImages(tagId, [second, first, third]);

    expect(
      raw
        .prepare('SELECT image_id, position FROM image_tags WHERE tag_id = ? ORDER BY position')
        .all(tagId),
    ).toEqual([
      { image_id: second, position: 0 },
      { image_id: first, position: 1 },
      { image_id: third, position: 2 },
    ]);
  });

  it('appends unique images after the highest existing board position', () => {
    const { manager, raw, tagId } = setupBoard();
    const existing = seedImage(testDb!, '/library/existing.jpg');
    const second = seedImage(testDb!, '/library/second.jpg');
    const third = seedImage(testDb!, '/library/third.jpg');
    raw
      .prepare(
        "INSERT INTO image_tags (image_id, tag_id, source, position) VALUES (?, ?, 'user', ?)",
      )
      .run(existing, tagId, 4);

    manager.boards.addImagesToBoard([second, third, second, existing], tagId);

    expect(
      raw
        .prepare('SELECT image_id, position FROM image_tags WHERE tag_id = ? ORDER BY position')
        .all(tagId),
    ).toEqual([
      { image_id: existing, position: 4 },
      { image_id: second, position: 5 },
      { image_id: third, position: 6 },
    ]);
  });
});
