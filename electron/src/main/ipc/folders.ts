import { ipcMain } from 'electron';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerFolderHandlers({
  dbService,
  watcherService,
  availabilityMonitor,
}: MainIpcContext): void {
  ipcMain.handle('add-folder', async (_event, { path }: { path: string }) => {
    const overlap = await dbService.findOverlappingFolders(path);
    const folderId = await dbService.addFolder(path);
    await watcherService.watchFolder(path);
    void availabilityMonitor.checkNow(path);
    return { folderId, overlap };
  });

  ipcMain.handle('scan-folder', async (event, { path, opId }: { path: string; opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.scanFolder(path, sendToRenderer(event.sender, 'scan-progress'), signal),
    );
  });

  ipcMain.handle('get-folders', async () => {
    return await dbService.getFolders();
  });

  ipcMain.handle('get-folders-with-stats', async () => {
    return await dbService.getFoldersWithStats();
  });

  ipcMain.handle('remove-folder', async (_event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    await dbService.removeFolder(path);
    return { success: true };
  });

  ipcMain.handle('watch-folder', async (_event, { path }: { path: string }) => {
    await watcherService.watchFolder(path);
    return { watching: true };
  });

  ipcMain.handle('unwatch-folder', async (_event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    return { watching: false };
  });

  ipcMain.handle(
    'set-folder-face-scan-exclusion',
    async (_event, { path, excluded }: { path: string; excluded: boolean }) => {
      return await dbService.setFolderFaceScanExclusion(path, excluded);
    },
  );
}
