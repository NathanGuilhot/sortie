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

describe('DatabaseSearchService OCR text search', () => {
  const ocrBlock = (text: string) => ({
    text,
    bbox: { x: 0.1, y: 0.1, width: 0.5, height: 0.1 },
    confidence: 0.9,
  });

  function textService(
    t: ReturnType<typeof createTestDb>,
    embedText: (text: string) => Promise<number[]> = async () => clipVector(0),
  ) {
    const embedded: string[] = [];
    const service = new DatabaseSearchService({
      requireDb: () => t.manager,
      getEmbedder: () =>
        ({
          embedText: (text: string) => {
            embedded.push(text);
            return embedText(text);
          },
        }) as unknown as ReturnType<
          ConstructorParameters<typeof DatabaseSearchService>[0]['getEmbedder']
        >,
      getOrBuildShuffledIds: (_cacheKey, loadIds) => loadIds(),
      fetchImagesByIdsInOrder: (ids) => ids.map((id) => image(id)) as SearchResult[],
    });
    return { service, embedded };
  }

  it('puts text matches first, then visual results, without duplicates', async () => {
    const t = createTestDb();
    try {
      const visualBest = seedImage(t, '/photos/1.jpg');
      const textFar = seedImage(t, '/photos/2.jpg');
      const textNear = seedImage(t, '/photos/3.jpg');
      t.manager.vectors.insertEmbedding(visualBest, clipVector(0));
      t.manager.vectors.insertEmbedding(textNear, clipVector(0.2));
      t.manager.vectors.insertEmbedding(textFar, clipVector(0.4));
      t.manager.ocr.saveImageOcr(textFar, [ocrBlock('Big SALE today')]);
      t.manager.ocr.saveImageOcr(textNear, [ocrBlock('sale')]);

      const { images } = await textService(t).service.queryImages({ text: 'sale' });

      expect(images.map((result) => result.id)).toEqual([textNear, textFar, visualBest]);
      expect(images[0].ocrMatch?.ranges).toEqual([{ block: 0, start: 0, end: 4 }]);
      expect(images[1].ocrMatch?.blocks[0]).toMatchObject({ text: 'Big SALE today', index: 0 });
      expect(images[2].ocrMatch).toBeUndefined();
    } finally {
      t.close();
    }
  });

  it('with quotes, shows only text matches and skips CLIP when nothing else is typed', async () => {
    const t = createTestDb();
    try {
      const visual = seedImage(t, '/photos/1.jpg');
      const text = seedImage(t, '/photos/2.jpg');
      t.manager.vectors.insertEmbedding(visual, clipVector(0));
      t.manager.ocr.saveImageOcr(text, [ocrBlock('Open late')]);

      const { service, embedded } = textService(t);
      const { images } = await service.queryImages({ text: '"open late"' });

      expect(images.map((result) => result.id)).toEqual([text]);
      expect(embedded).toEqual([]);
    } finally {
      t.close();
    }
  });

  it('ranks quoted matches by the unquoted words', async () => {
    const t = createTestDb();
    try {
      const far = seedImage(t, '/photos/1.jpg');
      const near = seedImage(t, '/photos/2.jpg');
      t.manager.vectors.insertEmbedding(far, clipVector(0.5));
      t.manager.vectors.insertEmbedding(near, clipVector(0.1));
      t.manager.ocr.saveImageOcr(far, [ocrBlock('sale')]);
      t.manager.ocr.saveImageOcr(near, [ocrBlock('sale')]);

      const { service, embedded } = textService(t);
      const { images } = await service.queryImages({ text: 'poster "sale"' });

      expect(embedded).toEqual(['poster']);
      expect(images.map((result) => result.id)).toEqual([near, far]);
    } finally {
      t.close();
    }
  });

  it('still returns text matches when CLIP fails', async () => {
    const t = createTestDb();
    try {
      const id = seedImage(t, '/photos/1.jpg');
      t.manager.ocr.saveImageOcr(id, [ocrBlock('sale')]);

      const { images } = await textService(t, async () => {
        throw new Error('model missing');
      }).service.queryImages({ text: 'sale' });

      expect(images.map((result) => result.id)).toEqual([id]);
    } finally {
      t.close();
    }
  });

  it('applies the other filters to text matches', async () => {
    const t = createTestDb();
    try {
      const plain = seedImage(t, '/photos/1.jpg');
      const fav = seedImage(t, '/photos/2.jpg');
      t.raw.prepare('UPDATE images SET favorite = 1 WHERE id = ?').run(fav);
      t.manager.ocr.saveImageOcr(plain, [ocrBlock('sale')]);
      t.manager.ocr.saveImageOcr(fav, [ocrBlock('sale')]);

      const { images } = await textService(t).service.queryImages({
        text: '"sale"',
        favorites: true,
      });

      expect(images.map((result) => result.id)).toEqual([fav]);
    } finally {
      t.close();
    }
  });

  it('leaves half the page to visual results when text matches abound', async () => {
    const t = createTestDb();
    try {
      const textIds: number[] = [];
      for (let index = 0; index < 6; index++) {
        const id = seedImage(t, `/photos/text-${index}.jpg`);
        t.manager.ocr.saveImageOcr(id, [ocrBlock('sale')]);
        textIds.push(id);
      }
      const visualIds: number[] = [];
      for (let index = 0; index < 6; index++) {
        const id = seedImage(t, `/photos/visual-${index}.jpg`);
        t.manager.vectors.insertEmbedding(id, clipVector(index * 0.01));
        visualIds.push(id);
      }

      const { images } = await textService(t).service.queryImages({ text: 'sale', limit: 4 });

      expect(images.filter((result) => result.ocrMatch)).toHaveLength(2);
      expect(images.slice(2).map((result) => result.id)).toEqual(visualIds.slice(0, 2));
    } finally {
      t.close();
    }
  });
});
