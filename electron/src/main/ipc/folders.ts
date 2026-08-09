import type { MainIpcContext } from './context';
import { handleInvoke, withOperation } from './context';
import { createThrottledEmitter } from './events';

export function registerFolderHandlers({
  dbService,
  watcherService,
  availabilityMonitor,
}: MainIpcContext): void {
  handleInvoke('addFolder', async (_event, { path }) => {
    const overlap = await dbService.folders.findOverlappingFolders(path);
    const folderId = await dbService.folders.addFolder(path);
    await watcherService.watchFolder(path);
    void availabilityMonitor.checkNow(path);
    return { folderId, overlap };
  });

  handleInvoke('scanFolder', async (event, { path, opId }) => {
    const emitter = createThrottledEmitter(event.sender, 'scanProgress');
    try {
      return await withOperation(opId, (signal) =>
        dbService.folders.scanFolder(
          path,
          (progress) => emitter.emit({ ...progress, opId }),
          signal,
        ),
      );
    } finally {
      emitter.flush();
    }
  });

  handleInvoke('getFolders', async () => {
    return await dbService.folders.getFolders();
  });

  handleInvoke('getFoldersWithStats', async () => {
    return await dbService.folders.getFoldersWithStats();
  });

  handleInvoke('removeFolder', async (_event, { path }) => {
    watcherService.stopWatching(path);
    await dbService.folders.removeFolder(path);
    return { success: true };
  });

  handleInvoke('watchFolder', async (_event, { path }) => {
    await watcherService.watchFolder(path);
    return { watching: true };
  });

  handleInvoke('unwatchFolder', async (_event, { path }) => {
    watcherService.stopWatching(path);
    return { watching: false };
  });

  handleInvoke('setFolderFaceScanExclusion', async (_event, { path, excluded }) => {
    return await dbService.folders.setFolderFaceScanExclusion(path, excluded);
  });
}
