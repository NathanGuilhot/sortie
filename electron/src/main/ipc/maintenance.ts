import { app, clipboard, ipcMain, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

async function wipeCacheDir(dirName: string): Promise<void> {
  const dir = path.join(app.getPath('userData'), dirName);
  try {
    const files = await fs.promises.readdir(dir);
    await Promise.all(
      files.map((file) =>
        fs.promises.rm(path.join(dir, file), { recursive: true, force: true }).catch(() => {}),
      ),
    );
  } catch {
    // Best-effort cache cleanup.
  }
}

export function registerMaintenanceHandlers({
  dbService,
  watcherService,
}: MainIpcContext): void {
  ipcMain.handle('reset-face-data', async () => {
    await dbService.resetFaceData();
    await wipeCacheDir('face-thumbs');
    return { success: true };
  });

  ipcMain.handle('reset-database', async () => {
    watcherService.stopAll();
    await dbService.resetDatabase();
    await Promise.all([
      wipeCacheDir('thumbs'),
      wipeCacheDir('face-thumbs'),
      wipeCacheDir('raw-previews'),
      wipeCacheDir('link-previews'),
    ]);
    return { success: true };
  });

  ipcMain.handle('compute-missing-hashes', async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.computeMissingHashes(sendToRenderer(event.sender, 'hash-progress'), signal),
    );
  });

  ipcMain.handle('find-duplicate-groups', async () => {
    return await dbService.findDuplicateGroups();
  });

  ipcMain.handle(
    'dismiss-duplicate-pair',
    async (_event, { imageId1, imageId2 }: { imageId1: number; imageId2: number }) => {
      await dbService.dismissDuplicatePair(imageId1, imageId2);
      return { success: true };
    },
  );

  ipcMain.handle('reveal-in-finder', async (_event, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle('copy-image-to-clipboard', async (_event, { filePath }: { filePath: string }) => {
    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) return { success: false };
    clipboard.writeImage(image);
    return { success: true };
  });
}
