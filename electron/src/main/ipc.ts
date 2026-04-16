import { ipcMain, dialog, BrowserWindow } from 'electron';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';

export function setupIpcHandlers(dbService: DatabaseService, watcherService: WatcherService, dbPath: string) {
  ipcMain.handle('pick-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Image operations
  ipcMain.handle('get-images', async (event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
    return await dbService.getImages(limit, offset);
  });

  ipcMain.handle('search-images', async (event, { query, limit }: { query: string; limit?: number }) => {
    return await dbService.searchImages(query, limit);
  });

  ipcMain.handle('filter-images', async (event, { tags, limit, offset }: { tags: string[]; limit?: number; offset?: number }) => {
    return await dbService.getImagesByTags(tags, limit, offset);
  });

  ipcMain.handle('add-folder', async (event, { path }: { path: string }) => {
    const folderId = await dbService.addFolder(path);
    // Start watching the folder
    await watcherService.watchFolder(path);
    return folderId;
  });

  ipcMain.handle('scan-folder', async (event, { path }: { path: string }) => {
    // TODO: implement actual scanning using pipeline
    const folderId = await dbService.scanFolder(path);
    return folderId;
  });

  ipcMain.handle('get-folders', async () => {
    return await dbService.getFolders();
  });

  ipcMain.handle('get-all-tags', async () => {
    return await dbService.getAllTags();
  });

  ipcMain.handle('update-image-tags', async (event, { imageId, tags }: { imageId: number; tags: string[] }) => {
    await dbService.updateImageTags(imageId, tags);
    return { success: true };
  });

  // Suggestions
  ipcMain.handle('get-suggestions', async (event, { imageId }: { imageId: number }) => {
    return await dbService.getSuggestions(imageId);
  });

  ipcMain.handle('dismiss-suggestion', async (event, { imageId, tagId }: { imageId: number; tagId: number }) => {
    await dbService.dismissSuggestion(imageId, tagId);
    return { success: true };
  });

  // Collections
  ipcMain.handle('get-collections', async () => {
    return await dbService.getCollections();
  });

  ipcMain.handle('create-collection', async (event, { name, description }: { name: string; description?: string }) => {
    const collectionId = await dbService.createCollection(name, description);
    return { collectionId };
  });

  ipcMain.handle('organize-images', async () => {
    const collectionIds = await dbService.organizeImages();
    return { collectionIds };
  });

  // Watcher control
  ipcMain.handle('watch-folder', async (event, { path }: { path: string }) => {
    await watcherService.watchFolder(path);
    return { watching: true };
  });

  ipcMain.handle('unwatch-folder', async (event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    return { watching: false };
  });

  // Image management
  ipcMain.handle('hide-image', async (_event, { imageId }: { imageId: number }) => {
    await dbService.hideImage(imageId);
    return { success: true };
  });

  ipcMain.handle('update-image-metadata', async (_event, { imageId, metadata }: { imageId: number; metadata: { description?: string; favorite?: boolean; captured_at?: string | null; city?: string | null; country?: string | null } }) => {
    await dbService.updateImageMetadata(imageId, metadata);
    return { success: true };
  });

  ipcMain.handle('recompute-embedding', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  // System
  ipcMain.handle('get-database-path', async () => {
    return dbPath;
  });
}