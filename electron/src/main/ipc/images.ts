import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { app } from 'electron';
import { isNoopImageEdit, type ImageEditTransform } from 'shared';
import { renderImageEdit } from '../imageEdit';
import { invalidateThumbnailCache } from '../protocols';

const EDITABLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function registerImageHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('getImageEditEligibility', async (_event, { imageId }) => {
    const image = await dbService.images.getImage(imageId);
    if (!image) return { editable: false, reason: 'Image is unavailable.' };
    if (!EDITABLE_EXTENSIONS.has(path.extname(image.file_path).toLowerCase())) {
      return { editable: false, reason: 'This image format cannot be edited.' };
    }
    try {
      await fs.access(image.file_path, fsConstants.W_OK);
      await fs.access(path.dirname(image.file_path), fsConstants.W_OK);
      return { editable: true, reason: null };
    } catch {
      return {
        editable: false,
        reason: 'This image is on a read-only drive or you do not have permission to edit it.',
      };
    }
  });

  handleInvoke('applyImageEdit', async (_event, { imageId, transform }) => {
    const image = await dbService.images.getImage(imageId);
    if (!image) throw new Error('Image is unavailable');
    const ext = path.extname(image.file_path).toLowerCase();
    if (!EDITABLE_EXTENSIONS.has(ext)) throw new Error('This image format cannot be edited');
    await fs.access(image.file_path, fsConstants.W_OK);
    await fs.access(path.dirname(image.file_path), fsConstants.W_OK);
    validateTransform(transform);
    if (isNoopImageEdit(transform)) return image;
    const tempPath = path.join(
      path.dirname(image.file_path),
      `.${path.basename(image.file_path)}.sortie-edit-${randomUUID()}`,
    );
    const output = await renderImageEdit(await fs.readFile(image.file_path), ext, transform);
    try {
      await fs.writeFile(tempPath, output, { flag: 'wx' });
      const originalStat = await fs.stat(image.file_path);
      await fs.chmod(tempPath, originalStat.mode);
      await fs.rename(tempPath, image.file_path);
      await invalidateThumbnailCache(app.getPath('userData'), image.file_path);
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
    dbService.ocr.invalidate(imageId);
    const result = await dbService.images.addImage(image.file_path);
    if (dbService.ocr.isAvailable())
      await dbService.ocr.ensure(result.imageId).catch(() => undefined);
    return await dbService.images.getImage(imageId);
  });
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

function validateTransform(transform: ImageEditTransform): void {
  const { left, top, right, bottom } = transform.crop;
  if (
    ![left, top, right, bottom].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    ) ||
    right <= left ||
    bottom <= top ||
    !Number.isInteger(transform.clockwiseTurns)
  )
    throw new Error('Invalid image edit');
}
