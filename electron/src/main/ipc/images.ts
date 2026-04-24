import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type Query, type SortieImageMetadataUpdate } from 'shared';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerImageHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.getImages,
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      return await dbService.getImages(limit, offset);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getImage, async (_event, { id }: { id: number }) => {
    return await dbService.getImage(id);
  });

  ipcMain.handle(IPC_CHANNELS.reshuffleImages, () => {
    dbService.reshuffle();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.queryImages, async (_event, query: Query) => {
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

  ipcMain.handle(IPC_CHANNELS.getEmbedderStatus, () => dbService.getEmbedderStatus());

  ipcMain.handle(
    IPC_CHANNELS.findSimilarImages,
    async (_event, { imageId, limit }: { imageId: number; limit?: number }) => {
      return await dbService.findSimilarImages(imageId, limit);
    },
  );

  ipcMain.handle(IPC_CHANNELS.getAllTags, async () => {
    return await dbService.getAllTags();
  });

  ipcMain.handle(IPC_CHANNELS.getTagsWithCounts, async () => {
    return await dbService.getTagsWithCounts();
  });

  ipcMain.handle(
    IPC_CHANNELS.updateImageTags,
    async (_event, { imageId, tags }: { imageId: number; tags: string[] }) => {
      await dbService.updateImageTags(imageId, tags);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.getSuggestions, async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getSuggestions(imageId);
  });

  ipcMain.handle(
    IPC_CHANNELS.dismissSuggestion,
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.dismissSuggestion(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.hideImage, async (_event, { imageId }: { imageId: number }) => {
    await dbService.hideImage(imageId);
    return { success: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.updateImageMetadata,
    async (
      _event,
      { imageId, metadata }: { imageId: number; metadata: SortieImageMetadataUpdate },
    ) => {
      await dbService.updateImageMetadata(imageId, metadata);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.getLinkPreview, async (_event, { url }: { url: string }) => {
    return await dbService.getLinkPreview(url);
  });

  ipcMain.handle(IPC_CHANNELS.fetchLinkPreview, async (_event, { url }: { url: string }) => {
    return await dbService.fetchAndCacheLinkPreview(url);
  });

  ipcMain.handle(IPC_CHANNELS.recomputeEmbedding, async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.recomputePalette, async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputePalette(imageId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.computeMissingPalettes, async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.computeMissingPalettes(sendToRenderer(event.sender, IPC_EVENTS.paletteProgress), signal),
    );
  });

  ipcMain.handle(IPC_CHANNELS.deleteImage, async (_event, { imageId }: { imageId: number }) => {
    await dbService.deleteImage(imageId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.backfillExif, async (_event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) => dbService.backfillExifData(signal));
  });
}
