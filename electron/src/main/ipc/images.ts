import { IPC_EVENTS } from 'shared';
import type { MainIpcContext } from './context';
import { handleInvoke, sendToRenderer, withOperation } from './context';

export function registerImageHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('getImages', async (_event, args) => {
    return await dbService.getImages(args?.limit, args?.offset);
  });

  handleInvoke('getImage', async (_event, { id }) => {
    return await dbService.getImage(id);
  });

  handleInvoke('reshuffleImages', () => {
    dbService.reshuffle();
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
    return await dbService.queryImages(query);
  });

  handleInvoke('getEmbedderStatus', () => dbService.getEmbedderStatus());

  handleInvoke('findSimilarImages', async (_event, { imageId, limit }) => {
    return await dbService.findSimilarImages(imageId, limit);
  });

  handleInvoke('getAllTags', async () => {
    return await dbService.getAllTags();
  });

  handleInvoke('getTagsWithCounts', async () => {
    return await dbService.getTagsWithCounts();
  });

  handleInvoke('updateImageTags', async (_event, { imageId, tags }) => {
    await dbService.updateImageTags(imageId, tags);
    return { success: true };
  });

  handleInvoke('getSuggestions', async (_event, { imageId }) => {
    return await dbService.getSuggestions(imageId);
  });

  handleInvoke('dismissSuggestion', async (_event, { imageId, tagId }) => {
    await dbService.dismissSuggestion(imageId, tagId);
    return { success: true };
  });

  handleInvoke('hideImage', async (_event, { imageId }) => {
    await dbService.hideImage(imageId);
    return { success: true };
  });

  handleInvoke('updateImageMetadata', async (_event, { imageId, metadata }) => {
    await dbService.updateImageMetadata(imageId, metadata);
    return { success: true };
  });

  handleInvoke('getLinkPreview', async (_event, { url }) => {
    return await dbService.getLinkPreview(url);
  });

  handleInvoke('fetchLinkPreview', async (_event, { url }) => {
    return await dbService.fetchAndCacheLinkPreview(url);
  });

  handleInvoke('recomputeEmbedding', async (_event, { imageId }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  handleInvoke('recomputePalette', async (_event, { imageId }) => {
    await dbService.recomputePalette(imageId);
    return { success: true };
  });

  handleInvoke('computeMissingPalettes', async (event, { opId }) => {
    return await withOperation(opId, (signal) =>
      dbService.computeMissingPalettes(
        sendToRenderer(event.sender, IPC_EVENTS.paletteProgress),
        signal,
      ),
    );
  });

  handleInvoke('deleteImage', async (_event, { imageId }) => {
    await dbService.deleteImage(imageId);
    return { success: true };
  });

  handleInvoke('backfillExif', async (_event, { opId }) => {
    return await withOperation(opId, (signal) => dbService.backfillExifData(signal));
  });
}
