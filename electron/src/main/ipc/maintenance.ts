import { app, clipboard, ipcMain, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC_CHANNELS, IPC_EVENTS } from 'shared';
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
  ipcMain.handle(IPC_CHANNELS.resetFaceData, async () => {
    await dbService.resetFaceData();
    await wipeCacheDir('face-thumbs');
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.resetDatabase, async () => {
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

  ipcMain.handle(IPC_CHANNELS.computeMissingHashes, async (event, { opId }: { opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.computeMissingHashes(sendToRenderer(event.sender, IPC_EVENTS.hashProgress), signal),
    );
  });

  ipcMain.handle(IPC_CHANNELS.findDuplicateGroups, async () => {
    return await dbService.findDuplicateGroups();
  });

  ipcMain.handle(
    IPC_CHANNELS.dismissDuplicatePair,
    async (_event, { imageId1, imageId2 }: { imageId1: number; imageId2: number }) => {
      await dbService.dismissDuplicatePair(imageId1, imageId2);
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.revealInFinder, async (_event, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.copyImageToClipboard, async (_event, { filePath }: { filePath: string }) => {
    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) return { success: false };
    clipboard.writeImage(image);
    return { success: true };
  });
}
