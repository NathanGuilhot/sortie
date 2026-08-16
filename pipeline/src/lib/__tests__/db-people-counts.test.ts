import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedFace, seedImage, type TestDb } from '../testing/test-db';

describe('DatabasePeopleRepository image counts', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => t.close());

  it('counts distinct visible photos independently from faces', () => {
    const personId = Number(
      t.raw.prepare("INSERT INTO persons (name) VALUES ('Ada')").run().lastInsertRowid,
    );
    const visible = seedImage(t, '/photos/visible.jpg');
    const hidden = seedImage(t, '/photos/hidden.jpg', { hidden: true });
    const missing = seedImage(t, '/photos/missing.jpg', { missing: true });
    const faceIds = [
      seedFace(t, visible),
      seedFace(t, visible),
      seedFace(t, hidden),
      seedFace(t, missing),
    ];
    const assign = t.raw.prepare('UPDATE faces SET person_id = ? WHERE id = ?');
    faceIds.forEach((faceId) => assign.run(personId, faceId));
    t.manager.people.updatePersonFaceCount(personId);
    const hiddenOnlyPersonId = Number(
      t.raw.prepare("INSERT INTO persons (name) VALUES ('Hidden')").run().lastInsertRowid,
    );
    const hiddenOnlyFace = seedFace(t, hidden);
    assign.run(hiddenOnlyPersonId, hiddenOnlyFace);
    t.manager.people.updatePersonFaceCount(hiddenOnlyPersonId);

    expect(t.manager.people.getAllPersons()).toEqual([
      expect.objectContaining({
        id: personId,
        face_count: 4,
        image_count: 1,
      }),
    ]);
    expect(t.manager.people.getPersonImageIds(personId)).toEqual([visible]);
  });
});
