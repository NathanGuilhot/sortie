import { app, clipboard, nativeImage, shell } from 'electron';
import fs from 'fs';
import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';
import { getSortieUserDataPaths } from '../userDataPaths';
import { createDisplayOrientedPngBuffer } from '../clipboardImage';

async function wipeCacheDir(dirPath: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(dirPath);
    await Promise.all(
      files.map((file) =>
        fs.promises.rm(`${dirPath}/${file}`, { recursive: true, force: true }).catch(() => {}),
      ),
    );
  } catch {
    // Best-effort cache cleanup.
  }
}

export function registerMaintenanceHandlers({ dbService, watcherService }: MainIpcContext): void {
  const userDataPaths = getSortieUserDataPaths(app.getPath('userData'));

  handleInvoke('resetFaceData', async () => {
    await dbService.maintenance.resetFaceData();
    await wipeCacheDir(userDataPaths.faceThumbs);
    return { success: true };
  });

  handleInvoke('resetDatabase', async () => {
    watcherService.stopAll();
    await dbService.maintenance.resetDatabase();
    await Promise.all([
      wipeCacheDir(userDataPaths.thumbs),
      wipeCacheDir(userDataPaths.faceThumbs),
      wipeCacheDir(userDataPaths.rawPreviews),
      wipeCacheDir(userDataPaths.linkPreviews),
      wipeCacheDir(userDataPaths.dragIcons),
      wipeCacheDir(userDataPaths.dragExports),
    ]);
    return { success: true };
  });

  handleInvoke('computeMissingHashes', async (event, { opId }) => {
    const emitter = createThrottledEmitter(event.sender, 'hashProgress');
    try {
      return await withOperation(opId, (signal) =>
        dbService.maintenance.computeMissingHashes(
          (progress) => emitter.emit({ ...progress, opId }),
          signal,
        ),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('findDuplicateGroups', async () => {
    return await dbService.maintenance.findDuplicateGroups();
  });

  handleInvoke('dismissDuplicatePair', async (_event, { imageId1, imageId2 }) => {
    await dbService.maintenance.dismissDuplicatePair(imageId1, imageId2);
    return { success: true };
  });

  handleInvoke('revealInFinder', async (_event, { filePath }) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  handleInvoke('copyImageToClipboard', async (_event, { filePath }) => {
    try {
      const buffer = await createDisplayOrientedPngBuffer(filePath);
      const image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) return { success: false };
      clipboard.writeImage(image);
      return { success: true };
    } catch (error) {
      console.warn('[clipboard] failed to copy display-oriented image:', error);
      return { success: false };
    }
  });
}
