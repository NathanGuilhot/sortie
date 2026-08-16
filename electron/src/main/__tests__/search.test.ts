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

describe('DatabaseSearchService origin filtering', () => {
  function serviceFor(t: ReturnType<typeof createTestDb>, cacheKeys: string[]) {
    return new DatabaseSearchService({
      requireDb: () => t.manager,
      getEmbedder: () => {
        throw new Error('embedder should not be used');
      },
      getOrBuildShuffledIds: (cacheKey, loadIds) => {
        cacheKeys.push(cacheKey);
        return loadIds();
      },
      fetchImagesByIdsInOrder: (ids) => ids.map((id) => image(id)) as SearchResult[],
    });
  }

  it('keys the filter cache per origin', async () => {
    const t = createTestDb();
    try {
      seedImage(t, '/photos/1.jpg', { originKind: 'downloaded', originDomain: 'tumblr.com' });
      const cacheKeys: string[] = [];
      const service = serviceFor(t, cacheKeys);

      await service.queryImages({ origin: { kind: 'downloaded' } });
      await service.queryImages({ origin: { domain: 'tumblr.com' } });

      expect(new Set(cacheKeys).size).toBe(2);
    } finally {
      t.close();
    }
  });

  it('reaches EXIF-less images through their acquisition date', async () => {
    const t = createTestDb();
    try {
      const saved = seedImage(t, '/photos/1.jpg', {
        originKind: 'downloaded',
        originDomain: 'tumblr.com',
        originAt: '2016-06-01T00:00:00.000Z',
      });
      seedImage(t, '/photos/2.jpg', {
        originKind: 'downloaded',
        originAt: '2024-06-01T00:00:00.000Z',
      });
      const shotThen = seedImage(t, '/photos/3.jpg', {
        originKind: 'camera',
        capturedAt: '2016-07-01T00:00:00.000Z',
      });

      const results = await serviceFor(t, []).queryImages({
        dateRange: { start: '2016-01-01T00:00:00.000Z', end: '2016-12-31T00:00:00.000Z' },
      });

      expect(results.images.map((result) => result.id).sort()).toEqual([saved, shotThen].sort());
    } finally {
      t.close();
    }
  });

  it('counts kinds and domains for the filter control', () => {
    const t = createTestDb();
    try {
      seedImage(t, '/photos/1.jpg', { originKind: 'downloaded', originDomain: 'tumblr.com' });
      seedImage(t, '/photos/2.jpg', { originKind: 'downloaded', originDomain: 'tumblr.com' });
      seedImage(t, '/photos/3.jpg', { originKind: 'screenshot' });
      seedImage(t, '/photos/4.jpg', {
        originKind: 'downloaded',
        originDomain: 'x.com',
        hidden: true,
      });

      const facets = t.manager.images.getOriginFacets();

      expect(facets.kinds).toEqual([
        { kind: 'downloaded', count: 2 },
        { kind: 'screenshot', count: 1 },
      ]);
      expect(facets.domains).toEqual([{ domain: 'tumblr.com', count: 2 }]);
    } finally {
      t.close();
    }
  });
});

describe('DatabaseSearchService gallery totals', () => {
  it('reports the full filtered size when only the first page is loaded', async () => {
    const t = createTestDb();
    try {
      for (let index = 0; index < 101; index++) {
        seedImage(t, `/photos/saved-${index}.jpg`, {
          originKind: 'downloaded',
          originDomain: 'tumblr.com',
        });
      }
      seedImage(t, '/photos/screenshot.jpg', { originKind: 'screenshot' });

      const page = await new DatabaseSearchService({
        requireDb: () => t.manager,
        getEmbedder: () => {
          throw new Error('embedder should not be used');
        },
        getOrBuildShuffledIds: (_cacheKey, loadIds) => loadIds(),
        fetchImagesByIdsInOrder: (ids) => ids.map((id) => image(id)) as SearchResult[],
      }).queryImages({ origin: { kind: 'downloaded' }, limit: 100 });

      expect(page).toMatchObject({ total: 101 });
      expect(page.images).toHaveLength(100);
    } finally {
      t.close();
    }
  });
});
