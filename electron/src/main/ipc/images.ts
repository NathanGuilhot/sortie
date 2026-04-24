import { ipcMain } from 'electron';
import type { Query, SortieImageMetadataUpdate } from 'shared';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerImageHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle(
    'get-images',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      return await dbService.getImages(limit, offset);
    },
  );

  ipcMain.handle('get-image', async (_event, { id }: { id: number }) => {
    return await dbService.getImage(id);
  });

  ipcMain.handle('reshuffle-images', () => {
    dbService.reshuffle();
    return { success: true };
  });

  ipcMain.handle('query-images', async (_event, query: Query) => {
    if (query.imageBytes) {
      const maxQueryBytes = 25 * 1024 * 1024;
      if (query.imageBytes.byteLength > maxQueryBytes) {
        throw new Error(
          `Image too large (${query.imageBytes.byteLength} bytes, max ${maxQueryBytes})`,
        );
      }
    }
    return await dbService.queryImages(query);
  });

  ipcMain.handle('get-embedder-status', () => dbService.getEmbedderStatus());

  ipcMain.handle(
    'find-similar-images',
    async (_event, { imageId, limit }: { imageId: number; limit?: number }) => {
      return await dbService.findSimilarImages(imageId, limit);
    },
  );

  ipcMain.handle('get-all-tags', async () => {
    return await dbService.getAllTags();
  });

  ipcMain.handle('get-tags-with-counts', async () => {
    return await dbService.getTagsWithCounts();
  });

  ipcMain.handle(
    'update-image-tags',
    async (_event, { imageId, tags }: { imageId: number; tags: string[] }) => {
      await dbService.updateImageTags(imageId, tags);
      return { success: true };
    },
  );

  ipcMain.handle('get-suggestions', async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getSuggestions(imageId);
  });

  ipcMain.handle(
    'dismiss-suggestion',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.dismissSuggestion(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle('hide-image', async (_event, { imageId }: { imageId: number }) => {
    await dbService.hideImage(imageId);
    return { success: true };
  });

  ipcMain.handle(
    'update-image-metadata',
    async (
      _event,
      { imageId, metadata }: { imageId: number; metadata: SortieImageMetadataUpdate },
    ) => {
      await dbService.updateImageMetadata(imageId, metadata);
      return { success: true };
    },
  );

  ipcMain.handle('get-link-preview', async (_event, { url }: { url: string }) => {
    return await dbService.getLinkPreview(url);
  });

  ipcMain.handle('fetch-link-preview', async (_event, { url }: { url: string }) => {
    return await dbService.fetchAndCacheLinkPreview(url);
  });

  ipcMain.handle('recompute-embedding', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  ipcMain.handle('recompute-palette', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputePalette(imageId);
    return { success: true };
  });

  ipcMain.handle('compute-missing-palettes', async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.computeMissingPalettes(sendToRenderer(event.sender, 'palette-progress'), signal),
    );
  });

  ipcMain.handle('delete-image', async (_event, { imageId }: { imageId: number }) => {
    await dbService.deleteImage(imageId);
    return { success: true };
  });

  ipcMain.handle('backfill-exif', async (_event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) => dbService.backfillExifData(signal));
  });
}
