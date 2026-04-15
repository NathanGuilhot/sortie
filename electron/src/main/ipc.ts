import { ipcMain } from 'electron';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';

export function setupIpcHandlers(dbService: DatabaseService, watcherService: WatcherService) {
  // Image operations
  ipcMain.handle('get-images', async (event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
    return await dbService.getImages(limit, offset);
  });

  ipcMain.handle('search-images', async (event, { query, limit }: { query: string; limit?: number }) => {
    return await dbService.searchImages(query, limit);
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

  // System
  ipcMain.handle('get-database-path', async () => {
    // TODO: return actual path
    return './sortie.db';
  });
}