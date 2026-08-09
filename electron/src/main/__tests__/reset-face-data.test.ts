import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type ClipEmbedder, type DatabaseManager, type TestDb } from 'pipeline';
import { CLIP_EMBEDDING_DIM } from 'shared';
import type { FileDeletionError } from '../database';
import { DatabaseMaintenanceService } from '../database/maintenance';

function unitVector(dim: number, axis: number): number[] {
  const vector = new Array<number>(dim).fill(0);
  vector[axis] = 1;
  return vector;
}

describe('reset face data', () => {
  let manager: DatabaseManager | null = null;
  let testDb: TestDb | null = null;

  afterEach(() => {
    testDb?.close();
    testDb = null;
    manager = null;
  });

  it('clears vec_face_clips so reused face rowids cannot match deleted embeddings', async () => {
    testDb = createTestDb();
    manager = testDb.manager;
    const { raw: db } = testDb;
    db.prepare('INSERT INTO images (file_path, file_name) VALUES (?, ?)').run(
      '/photos/a.jpg',
      'a.jpg',
    );
    const imageId = (db.prepare('SELECT id FROM images').get() as { id: number }).id;

    const faceId = manager.people.insertFace({
      image_id: imageId,
      person_id: null,
      bbox_x: 0,
      bbox_y: 0,
      bbox_w: 10,
      bbox_h: 10,
      confidence: 0.99,
    });
    const embeddingA = unitVector(CLIP_EMBEDDING_DIM, 0);
    manager.people.insertFaceClipEmbedding(faceId, embeddingA);

    const service = new DatabaseMaintenanceService({
      requireDb: () => manager!,
      invalidateImageCache: () => undefined,
      getEmbedder: (() => undefined) as unknown as () => ClipEmbedder,
      createFileDeletionError: (() => undefined) as unknown as (
        filePath: string,
        code: string | undefined,
        cause: Error,
      ) => FileDeletionError,
    });

    await service.resetFaceData();

    expect(db.prepare('SELECT COUNT(*) AS count FROM vec_face_clips').get()).toEqual({
      count: 0,
    });

    // The rowid-reuse ghost match: a new face takes the deleted face's rowid but
    // has no clip embedding of its own, so a search for A must find nothing.
    const newFaceId = manager.people.insertFace({
      image_id: imageId,
      person_id: null,
      bbox_x: 5,
      bbox_y: 5,
      bbox_w: 20,
      bbox_h: 20,
      confidence: 0.5,
    });
    expect(newFaceId).toBe(faceId);
    expect(manager.people.findNearestFaceClip(embeddingA)).toEqual([]);
  });
});
