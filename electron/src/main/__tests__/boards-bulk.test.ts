import { describe, expect, it } from 'vitest';
import type { DatabaseManager } from 'pipeline';
import { DatabaseBoardsService } from '../database/boards';

describe('DatabaseBoardsService.addImagesToBoard', () => {
  it('appends unique images after existing board positions', async () => {
    const links: Array<{ imageId: number; tagId: number; position: number }> = [];
    const db = {
      transaction: (fn: () => void) => fn,
      prepare: (sql: string) => {
        if (sql.includes('SELECT COALESCE(MAX(position)')) {
          return {
            get: (tagId: number) => {
              const positions = links
                .filter((link) => link.tagId === tagId)
                .map((link) => link.position);
              return { next: positions.length === 0 ? 0 : Math.max(...positions) + 1 };
            },
          };
        }

        if (sql.includes('INSERT OR IGNORE INTO image_tags')) {
          return {
            run: (imageId: number, tagId: number, position: number) => {
              if (links.some((link) => link.imageId === imageId && link.tagId === tagId)) {
                return;
              }
              links.push({ imageId, tagId, position });
            },
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    const service = new DatabaseBoardsService({
      requireDb: () => ({ getDatabase: () => db }) as unknown as DatabaseManager,
      fetchImagesByIdsInOrder: () => [],
      invalidateMetadataCaches: () => undefined,
      getSuggestionEngine: () => {
        throw new Error('not needed');
      },
    });

    await service.addImageToBoard(10, 1);
    await service.addImagesToBoard([20, 30, 20], 1);

    expect(links).toEqual([
      { imageId: 10, tagId: 1, position: 0 },
      { imageId: 20, tagId: 1, position: 1 },
      { imageId: 30, tagId: 1, position: 2 },
    ]);
  });
});
