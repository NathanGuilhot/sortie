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

  handleInvoke('resetDatabase', async () => {
    watcherService.stopAll();
    await dbService.maintenance.resetDatabase();
    await Promise.all([
      wipeCacheDir(userDataPaths.thumbs),
      wipeCacheDir(userDataPaths.rawPreviews),
      wipeCacheDir(userDataPaths.linkPreviews),
      wipeCacheDir(userDataPaths.dragIcons),
      wipeCacheDir(userDataPaths.dragExports),
    ]);
    return { success: true };
  });

  handleInvoke('scanDuplicates', async (event, { opId }) => {
    const emitter = createThrottledEmitter(event.sender, 'hashProgress');
    try {
      return await withOperation(opId, (signal) =>
        dbService.duplicates.scan((progress) => emitter.emit({ ...progress, opId }), signal),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('dismissDuplicateGroup', async (_event, { groupId }) => {
    await dbService.duplicates.dismiss(groupId);
    return { success: true };
  });

  handleInvoke('keepDuplicate', async (_event, { groupId, keepId }) =>
    dbService.duplicates.keep(groupId, keepId),
  );

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
