import { ipcMain, dialog, BrowserWindow } from 'electron';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';

export function setupIpcHandlers(
  dbService: DatabaseService,
  watcherService: WatcherService,
  dbPath: string,
) {
  ipcMain.handle('pick-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'get-images',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      return await dbService.getImages(limit, offset);
    },
  );

  ipcMain.handle(
    'search-images',
    async (_event, { query, limit }: { query: string; limit?: number }) => {
      return await dbService.searchImages(query, limit);
    },
  );

  ipcMain.handle(
    'find-similar-images',
    async (_event, { imageId, limit }: { imageId: number; limit?: number }) => {
      return await dbService.findSimilarImages(imageId, limit);
    },
  );

  ipcMain.handle(
    'get-favorite-images',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      return await dbService.getFavoriteImages(limit, offset);
    },
  );

  ipcMain.handle(
    'filter-images',
    async (
      _event,
      { tags, limit, offset }: { tags: string[]; limit?: number; offset?: number },
    ) => {
      return await dbService.getImagesByTags(tags, limit, offset);
    },
  );

  ipcMain.handle('add-folder', async (_event, { path }: { path: string }) => {
    const folderId = await dbService.addFolder(path);
    await watcherService.watchFolder(path);
    return folderId;
  });

  ipcMain.handle('scan-folder', async (_event, { path }: { path: string }) => {
    const folderId = await dbService.scanFolder(path);
    return folderId;
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

  ipcMain.handle('get-all-tags', async () => {
    return await dbService.getAllTags();
  });

  ipcMain.handle(
    'update-image-tags',
    async (_event, { imageId, tags }: { imageId: number; tags: string[] }) => {
      await dbService.updateImageTags(imageId, tags);
      return { success: true };
    },
  );

  ipcMain.handle('get-suggestions', async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getSuggestions(imageId);
  });

  ipcMain.handle(
    'dismiss-suggestion',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.dismissSuggestion(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle('get-collections', async () => {
    return await dbService.getCollections();
  });

  ipcMain.handle(
    'create-collection',
    async (_event, { name, description }: { name: string; description?: string }) => {
      const collectionId = await dbService.createCollection(name, description);
      return { collectionId };
    },
  );

  ipcMain.handle('organize-images', async () => {
    const collectionIds = await dbService.organizeImages();
    return { collectionIds };
  });

  ipcMain.handle('watch-folder', async (_event, { path }: { path: string }) => {
    await watcherService.watchFolder(path);
    return { watching: true };
  });

  ipcMain.handle('unwatch-folder', async (_event, { path }: { path: string }) => {
    watcherService.stopWatching(path);
    return { watching: false };
  });

  ipcMain.handle('hide-image', async (_event, { imageId }: { imageId: number }) => {
    await dbService.hideImage(imageId);
    return { success: true };
  });

  ipcMain.handle(
    'update-image-metadata',
    async (
      _event,
      {
        imageId,
        metadata,
      }: {
        imageId: number;
        metadata: {
          description?: string;
          favorite?: boolean;
          captured_at?: string | null;
          city?: string | null;
          country?: string | null;
        };
      },
    ) => {
      await dbService.updateImageMetadata(imageId, metadata);
      return { success: true };
    },
  );

  ipcMain.handle('recompute-embedding', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  ipcMain.handle('get-database-path', async () => {
    return dbPath;
  });

  // Cleanup / Duplicate detection
  ipcMain.handle('compute-missing-hashes', async (event) => {
    const webContents = event.sender;
    const result = await dbService.computeMissingHashes((progress) => {
      webContents.send('hash-progress', progress);
    });
    return { computed: result };
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

  ipcMain.handle('delete-image', async (_event, { imageId }: { imageId: number }) => {
    await dbService.deleteImage(imageId);
    return { success: true };
  });
}
