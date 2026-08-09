import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';

export function registerImageHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('getImages', async (_event, args) => {
    return await dbService.images.getImages(args?.limit, args?.offset);
  });

  handleInvoke('getImage', async (_event, { id }) => {
    return await dbService.images.getImage(id);
  });

  handleInvoke('reshuffleImages', () => {
    dbService.images.reshuffle();
    return { success: true };
  });

  handleInvoke('queryImages', async (_event, query) => {
    if (query.imageBytes) {
      const maxQueryBytes = 25 * 1024 * 1024;
      if (query.imageBytes.byteLength > maxQueryBytes) {
        throw new Error(
          `Image too large (${query.imageBytes.byteLength} bytes, max ${maxQueryBytes})`,
        );
      }
    }
    return await dbService.search.queryImages(query);
  });

  handleInvoke('getEmbedderStatus', () => dbService.getEmbedderStatus());

  handleInvoke('findSimilarImages', async (_event, { imageId, limit }) => {
    return await dbService.search.findSimilarImages(imageId, limit);
  });

  handleInvoke('getAllTags', async () => {
    return await dbService.images.getAllTags();
  });

  handleInvoke('getTagsWithCounts', async () => {
    return await dbService.images.getTagsWithCounts();
  });

  handleInvoke('updateImageTags', async (_event, { imageId, tags }) => {
    await dbService.images.updateImageTags(imageId, tags);
    return { success: true };
  });

  handleInvoke('getSuggestions', async (_event, { imageId }) => {
    return await dbService.images.getSuggestions(imageId);
  });

  handleInvoke('dismissSuggestion', async (_event, { imageId, tagId }) => {
    await dbService.images.dismissSuggestion(imageId, tagId);
    return { success: true };
  });

  handleInvoke('hideImage', async (_event, { imageId }) => {
    await dbService.images.hideImage(imageId);
    return { success: true };
  });

  handleInvoke('updateImageMetadata', async (_event, { imageId, metadata }) => {
    await dbService.images.updateImageMetadata(imageId, metadata);
    return { success: true };
  });

  handleInvoke('getLinkPreview', async (_event, { url }) => {
    return await dbService.images.getLinkPreview(url);
  });

  handleInvoke('fetchLinkPreview', async (_event, { url }) => {
    return await dbService.images.fetchAndCacheLinkPreview(url);
  });

  handleInvoke('recomputeEmbedding', async (_event, { imageId }) => {
    await dbService.maintenance.recomputeEmbedding(imageId);
    return { success: true };
  });

  handleInvoke('recomputePalette', async (_event, { imageId }) => {
    await dbService.maintenance.recomputePalette(imageId);
    return { success: true };
  });

  handleInvoke('computeMissingPalettes', async (event, { opId }) => {
    const emitter = createThrottledEmitter(event.sender, 'paletteProgress');
    try {
      return await withOperation(opId, (signal) =>
        dbService.maintenance.computeMissingPalettes(
          (progress) => emitter.emit({ ...progress, opId }),
          signal,
        ),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('deleteImage', async (_event, { imageId }) => {
    await dbService.maintenance.deleteImage(imageId);
    return { success: true };
  });

  handleInvoke('backfillExif', async (_event, { opId }) => {
    return await withOperation(opId, (signal) => dbService.maintenance.backfillExifData(signal));
  });
}
