import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from 'shared';
import type { MainIpcContext } from './context';
import { sendToRenderer, withOperation } from './context';

export function registerFolderHandlers({
  dbService,
  watcherService,
  availabilityMonitor,
}: MainIpcContext): void {
  ipcMain.handle(IPC_CHANNELS.addFolder, async (_event, { path }: { path: string }) => {
    const overlap = await dbService.findOverlappingFolders(path);
    const folderId = await dbService.addFolder(path);
    await watcherService.watchFolder(path);
    void availabilityMonitor.checkNow(path);
    return { folderId, overlap };
  });

  ipcMain.handle(IPC_CHANNELS.scanFolder, async (event, { path, opId }: { path: string; opId: string }) => {
    return await withOperation(opId, (signal) =>
      dbService.scanFolder(path, sendToRenderer(event.sender, IPC_EVENTS.scanProgress), signal),
    );
  });

  ipcMain.handle(IPC_CHANNELS.getFolders, async () => {
    return await dbService.getFolders();
  });

  ipcMain.handle(IPC_CHANNELS.getFoldersWithStats, async () => {
    return await dbService.getFoldersWithStats();
  });

  ipcMain.handle(IPC_CHANNELS.removeFolder, async (_event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    await dbService.removeFolder(path);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.watchFolder, async (_event, { path }: { path: string }) => {
    await watcherService.watchFolder(path);
    return { watching: true };
  });

  ipcMain.handle(IPC_CHANNELS.unwatchFolder, async (_event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    return { watching: false };
  });

  ipcMain.handle(
    IPC_CHANNELS.setFolderFaceScanExclusion,
    async (_event, { path, excluded }: { path: string; excluded: boolean }) => {
      return await dbService.setFolderFaceScanExclusion(path, excluded);
    },
  );
}
