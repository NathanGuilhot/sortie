import { describe, expect, it } from 'vitest';
import { createTestDb, seedImage } from 'pipeline';
import { CLIP_EMBEDDING_DIM } from 'shared';
import type { Image, SearchResult } from 'shared';
import { DatabaseSearchService } from '../database/search';

function image(id: number): Image {
  return {
    id,
    file_path: `/photos/${id}.jpg`,
    file_name: `${id}.jpg`,
    file_size: 100,
    mime_type: 'image/jpeg',
    width: 100,
    height: 100,
    created_at: '2026-01-01T00:00:00.000Z',
    modified_at: '2026-01-01T00:00:00.000Z',
    captured_at: null,
    latitude: null,
    longitude: null,
    city: null,
    country: null,
    description: null,
    favorite: false,
    hidden: false,
    missing: false,
  };
}

// Unit vector rotated by theta in the first two dimensions: distance from
// clipVector(0) grows monotonically with theta, giving a deterministic ranking.
function clipVector(theta: number): number[] {
  const vector = new Array<number>(CLIP_EMBEDDING_DIM).fill(0);
  vector[0] = Math.cos(theta);
  vector[1] = Math.sin(theta);
  return vector;
}

describe('DatabaseSearchService.findSimilarImages', () => {
  it('excludes hidden and missing vector matches', async () => {
    const t = createTestDb();
    try {
      const queryId = seedImage(t, '/photos/1.jpg');
      const hiddenId = seedImage(t, '/photos/2.jpg', { hidden: true });
      const missingId = seedImage(t, '/photos/3.jpg', { missing: true });
      const visibleId = seedImage(t, '/photos/4.jpg');

      t.manager.vectors.insertEmbedding(queryId, clipVector(0));
      t.manager.vectors.insertEmbedding(hiddenId, clipVector(0.1));
      t.manager.vectors.insertEmbedding(missingId, clipVector(0.2));
      t.manager.vectors.insertEmbedding(visibleId, clipVector(0.3));

      const service = new DatabaseSearchService({
        requireDb: () => t.manager,
        getEmbedder: () => {
          throw new Error('embedder should not be used');
        },
        getOrBuildShuffledIds: (_cacheKey, loadIds) => loadIds(),
        fetchImagesByIdsInOrder: (ids) => ids.map((id) => image(id)) as SearchResult[],
      });

      const results = await service.findSimilarImages(queryId, 20);

      expect(results.map((result) => result.id)).toEqual([visibleId]);
    } finally {
      t.close();
    }
  });
});
