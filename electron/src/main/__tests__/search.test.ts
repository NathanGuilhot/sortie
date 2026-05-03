import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseManager } from 'pipeline';
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

describe('DatabaseSearchService.findSimilarImages', () => {
  it('excludes hidden and missing vector matches', async () => {
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec(`
        CREATE TABLE images (
          id INTEGER PRIMARY KEY,
          hidden INTEGER DEFAULT 0,
          missing INTEGER DEFAULT 0
        );
      `);
      sqlite.prepare('INSERT INTO images (id, hidden, missing) VALUES (?, ?, ?)').run(1, 0, 0);
      sqlite.prepare('INSERT INTO images (id, hidden, missing) VALUES (?, ?, ?)').run(2, 1, 0);
      sqlite.prepare('INSERT INTO images (id, hidden, missing) VALUES (?, ?, ?)').run(3, 0, 1);
      sqlite.prepare('INSERT INTO images (id, hidden, missing) VALUES (?, ?, ?)').run(4, 0, 0);

      const manager = {
        getDatabase: () => sqlite,
        getEmbedding: (imageId: number) => (imageId === 1 ? [1, 0] : null),
        findNearestImageMatches: () => [
          { rowid: 1, distance: 0 },
          { rowid: 2, distance: 0.1 },
          { rowid: 3, distance: 0.2 },
          { rowid: 4, distance: 0.3 },
        ],
      } as unknown as DatabaseManager;

      const service = new DatabaseSearchService({
        requireDb: () => manager,
        getEmbedder: () => {
          throw new Error('embedder should not be used');
        },
        getOrBuildShuffledIds: (_cacheKey, loadIds) => loadIds(),
        fetchImagesByIdsInOrder: (ids) => ids.map((id) => image(id)) as SearchResult[],
      });

      const results = await service.findSimilarImages(1, 20);

      expect(results.map((result) => result.id)).toEqual([4]);
    } finally {
      sqlite.close();
    }
  });
});
