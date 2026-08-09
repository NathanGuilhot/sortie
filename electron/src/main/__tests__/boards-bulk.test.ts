import { describe, expect, it, vi } from 'vitest';
import type { DatabaseManager } from 'pipeline';
import { DatabaseBoardsService } from '../database/boards';

describe('DatabaseBoardsService.addImagesToBoard', () => {
  it('delegates persistence to the pipeline repository and invalidates metadata caches', async () => {
    const addImagesToBoard = vi.fn();
    const invalidateMetadataCaches = vi.fn();
    const service = new DatabaseBoardsService({
      requireDb: () => ({ boards: { addImagesToBoard } }) as unknown as DatabaseManager,
      fetchImagesByIdsInOrder: () => [],
      invalidateMetadataCaches,
      getSuggestionEngine: () => {
        throw new Error('not needed');
      },
    });

    await service.addImagesToBoard([20, 30, 20], 1);

    expect(addImagesToBoard).toHaveBeenCalledWith([20, 30, 20], 1);
    expect(invalidateMetadataCaches).toHaveBeenCalledOnce();
  });
});
