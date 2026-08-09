import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLIP_EMBEDDING_DIM } from 'shared';
import { DatabaseImageRepository } from '../db-images';
import { DatabasePeopleRepository } from '../db-people';
import { DatabaseVectorRepository } from '../db-vectors';
import { createTestDb, seedFace, seedImage, type TestDb } from '../testing/test-db';

function embedding(value: number): number[] {
  const vector = new Array<number>(CLIP_EMBEDDING_DIM).fill(0);
  vector[0] = value;
  return vector;
}

describe('DatabaseVectorRepository', () => {
  let t: TestDb;

  beforeEach(() => {
    t = createTestDb();
  });

  afterEach(() => {
    t.close();
  });

  it('round-trips manager-written embeddings through visible nearest-neighbor search', () => {
    const imageId = seedImage(t, '/photos/visible.jpg');
    const hiddenImageId = seedImage(t, '/photos/hidden.jpg', { hidden: true });

    t.manager.vectors.insertEmbedding(imageId, embedding(1));
    t.manager.vectors.insertEmbedding(hiddenImageId, embedding(0.9));

    expect(t.manager.vectors.findNearestVisibleImages(embedding(1), 10, 1.3)).toEqual([
      expect.objectContaining({ rowid: imageId }),
    ]);
  });

  it('uses safe defaults when sqlite-vec is unavailable', () => {
    const imageId = seedImage(t, '/photos/image.jpg');
    const faceId = seedFace(t, imageId);
    const images = new DatabaseImageRepository(t.raw, t.manager.tags, false);
    const vectors = new DatabaseVectorRepository(t.raw, false);
    const people = new DatabasePeopleRepository(t.raw, false);

    vectors.insertEmbedding(imageId, embedding(1));
    people.insertFaceEmbedding(faceId, embedding(1));
    people.insertFaceClipEmbedding(faceId, embedding(1));
    people.insertPersonEmbedding(1, embedding(1));

    expect(images.getImageScanState('/photos/image.jpg')).toMatchObject({
      id: imageId,
      embedded: 0,
    });
    expect(images.getImagesByIds([imageId])[0]).toMatchObject({ embedded: false });
    expect(vectors.getEmbedding(imageId)).toBeNull();
    expect(vectors.findNearestVisibleImages(embedding(1), 10, 1.3)).toEqual([]);
    expect(people.getFaceEmbedding(faceId)).toBeNull();
    expect(people.findNearestFace(embedding(1))).toEqual([]);
    expect(people.findNearestFaceClip(embedding(1))).toEqual([]);
    expect(people.findNearestPerson(embedding(1))).toEqual([]);
  });
});
