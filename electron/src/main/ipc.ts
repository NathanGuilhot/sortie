import { ipcMain, dialog, shell, BrowserWindow, app, clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { FolderAvailabilityMonitor } from './folderAvailability';
import { registerOperation, cancelOperation, clearOperation } from './operations';
import {
  PinterestAPIError,
  loadMore as pinterestLoadMore,
  parsePinterestInput,
  scrapeFirstPage,
} from './pinterest/scraper';
import { getImportFolder, importPin } from './pinterest/import';
import { bulkImportBoard } from './pinterest/bulkImport';
import { randomUUID } from 'crypto';
import type { PinterestResult, Query } from 'shared';

export function setupIpcHandlers(
  dbService: DatabaseService,
  watcherService: WatcherService,
  availabilityMonitor: FolderAvailabilityMonitor,
  dbPath: string,
) {
  ipcMain.handle('pick-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
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

  ipcMain.handle('get-image', async (_event, { id }: { id: number }) => {
    return await dbService.getImage(id);
  });

  ipcMain.handle('reshuffle-images', () => {
    dbService.reshuffle();
    return { success: true };
  });

  ipcMain.handle('query-images', async (_event, query: Query) => {
    if (query.imageBytes) {
      const MAX_QUERY_BYTES = 25 * 1024 * 1024;
      if (query.imageBytes.byteLength > MAX_QUERY_BYTES) {
        throw new Error(
          `Image too large (${query.imageBytes.byteLength} bytes, max ${MAX_QUERY_BYTES})`,
        );
      }
    }
    return await dbService.queryImages(query);
  });

  ipcMain.handle('get-embedder-status', () => dbService.getEmbedderStatus());

  ipcMain.handle(
    'find-similar-images',
    async (_event, { imageId, limit }: { imageId: number; limit?: number }) => {
      return await dbService.findSimilarImages(imageId, limit);
    },
  );

  ipcMain.handle('add-folder', async (_event, { path }: { path: string }) => {
    const folderId = await dbService.addFolder(path);
    await watcherService.watchFolder(path);
    void availabilityMonitor.checkNow(path);
    return folderId;
  });

  ipcMain.handle('recheck-folder-availability', async (_event, args?: { path?: string }) => {
    const changes = await availabilityMonitor.checkNow(args?.path);
    return { changes };
  });

  ipcMain.handle('scan-folder', async (event, { path, opId }: { path: string; opId: string }) => {
    const webContents = event.sender;
    const signal = registerOperation(opId);
    try {
      return await dbService.scanFolder(
        path,
        (progress) => webContents.send('scan-progress', progress),
        signal,
      );
    } finally {
      clearOperation(opId);
    }
  });

  ipcMain.handle('cancel-operation', async (_event, { opId }: { opId: string }) => {
    return { cancelled: cancelOperation(opId) };
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

  ipcMain.handle('reset-face-data', async () => {
    await dbService.resetFaceData();
    // Wipe cached face thumbnails — SQLite reuses row IDs after DELETE so
    // stale crops would be served for the new face rows.
    const faceThumbDir = path.join(app.getPath('userData'), 'face-thumbs');
    try {
      const files = fs.readdirSync(faceThumbDir);
      for (const file of files) fs.unlinkSync(path.join(faceThumbDir, file));
    } catch {
      /* dir may not exist */
    }
    return { success: true };
  });

  ipcMain.handle('reset-database', async () => {
    watcherService.stopAll();
    await dbService.resetDatabase();
    return { success: true };
  });

  ipcMain.handle('get-all-tags', async () => {
    return await dbService.getAllTags();
  });

  ipcMain.handle('get-tags-with-counts', async () => {
    return await dbService.getTagsWithCounts();
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

  // --- Boards (tag-backed) ---

  ipcMain.handle('boards:list', async () => {
    return await dbService.getBoards();
  });

  ipcMain.handle('boards:get', async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoard(tagId);
  });

  ipcMain.handle(
    'boards:get-images',
    async (
      _event,
      { tagId, limit, offset }: { tagId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getBoardImages(tagId, limit, offset);
    },
  );

  ipcMain.handle(
    'boards:reorder',
    async (_event, { tagId, orderedImageIds }: { tagId: number; orderedImageIds: number[] }) => {
      await dbService.reorderBoardImages(tagId, orderedImageIds);
      return { success: true };
    },
  );

  ipcMain.handle('boards:get-image-suggestions', async (_event, { tagId }: { tagId: number }) => {
    return await dbService.getBoardImageSuggestions(tagId);
  });

  ipcMain.handle(
    'boards:add-image',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.addImageToBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:remove-image',
    async (_event, { imageId, tagId }: { imageId: number; tagId: number }) => {
      await dbService.removeImageFromBoard(imageId, tagId);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:create',
    async (_event, { name, color }: { name: string; color?: string }) => {
      return await dbService.createBoard(name, color);
    },
  );

  ipcMain.handle(
    'boards:rename',
    async (_event, { tagId, name }: { tagId: number; name: string }) => {
      await dbService.renameBoard(tagId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    'boards:set-color',
    async (_event, { tagId, color }: { tagId: number; color: string }) => {
      await dbService.setBoardColor(tagId, color);
      return { success: true };
    },
  );

  ipcMain.handle('boards:delete', async (_event, { tagId }: { tagId: number }) => {
    await dbService.deleteBoard(tagId);
    return { success: true };
  });

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

  ipcMain.handle(
    'set-folder-face-scan-exclusion',
    async (_event, { path, excluded }: { path: string; excluded: boolean }) => {
      return await dbService.setFolderFaceScanExclusion(path, excluded);
    },
  );

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
          website_link?: string | null;
        };
      },
    ) => {
      await dbService.updateImageMetadata(imageId, metadata);
      return { success: true };
    },
  );

  ipcMain.handle('get-link-preview', async (_event, { url }: { url: string }) => {
    return await dbService.getLinkPreview(url);
  });

  ipcMain.handle('fetch-link-preview', async (_event, { url }: { url: string }) => {
    return await dbService.fetchAndCacheLinkPreview(url);
  });

  ipcMain.handle('recompute-embedding', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputeEmbedding(imageId);
    return { success: true };
  });

  ipcMain.handle('recompute-palette', async (_event, { imageId }: { imageId: number }) => {
    await dbService.recomputePalette(imageId);
    return { success: true };
  });

  ipcMain.handle('compute-missing-palettes', async (event, { opId }: { opId: string }) => {
    const webContents = event.sender;
    const signal = registerOperation(opId);
    try {
      return await dbService.computeMissingPalettes(
        (progress) => webContents.send('palette-progress', progress),
        signal,
      );
    } finally {
      clearOperation(opId);
    }
  });

  ipcMain.handle('get-database-path', async () => {
    return dbPath;
  });

  // Cleanup / Duplicate detection
  ipcMain.handle('compute-missing-hashes', async (event, { opId }: { opId: string }) => {
    const webContents = event.sender;
    const signal = registerOperation(opId);
    try {
      return await dbService.computeMissingHashes(
        (progress) => webContents.send('hash-progress', progress),
        signal,
      );
    } finally {
      clearOperation(opId);
    }
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

  ipcMain.handle('backfill-exif', async (_event, { opId }: { opId: string }) => {
    const signal = registerOperation(opId);
    try {
      return await dbService.backfillExifData(signal);
    } finally {
      clearOperation(opId);
    }
  });

  // --- Face Detection / People ---

  ipcMain.handle('get-persons', async () => {
    return await dbService.getPersons();
  });

  ipcMain.handle(
    'get-person-images',
    async (
      _event,
      { personId, limit, offset }: { personId: number; limit?: number; offset?: number },
    ) => {
      return await dbService.getPersonImages(personId, limit, offset);
    },
  );

  ipcMain.handle(
    'rename-person',
    async (_event, { personId, name }: { personId: number; name: string }) => {
      await dbService.renamePerson(personId, name);
      return { success: true };
    },
  );

  ipcMain.handle(
    'merge-persons',
    async (
      _event,
      { keepPersonId, mergePersonId }: { keepPersonId: number; mergePersonId: number },
    ) => {
      await dbService.mergePersons(keepPersonId, mergePersonId);
      return { success: true };
    },
  );

  ipcMain.handle('split-face-from-person', async (_event, { faceId }: { faceId: number }) => {
    const newPersonId = await dbService.splitFaceFromPerson(faceId);
    return { newPersonId };
  });

  ipcMain.handle('get-image-faces', async (_event, { imageId }: { imageId: number }) => {
    return await dbService.getImageFaces(imageId);
  });

  ipcMain.handle(
    'set-person-thumbnail',
    async (_event, { personId, faceId }: { personId: number; faceId: number }) => {
      await dbService.setPersonThumbnail(personId, faceId);
      return { success: true };
    },
  );

  ipcMain.handle('process-faces', async (event, { opId }: { opId: string }) => {
    const webContents = event.sender;
    const signal = registerOperation(opId);
    try {
      return await dbService.processExistingImagesForFaces(
        (progress) => webContents.send('face-scan-progress', progress),
        signal,
      );
    } finally {
      clearOperation(opId);
    }
  });

  ipcMain.handle('delete-person', async (_event, { personId }: { personId: number }) => {
    await dbService.deletePerson(personId);
    return { success: true };
  });

  // --- App info / system ---

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:showAboutPanel', () => {
    app.showAboutPanel();
  });

  ipcMain.handle('app:openExternal', async (_event, { url }: { url: string }) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Refusing to open non-http(s) URL: ${url}`);
    }
    await shell.openExternal(url);
    return { success: true };
  });

  // --- Pinterest import ---

  async function pinterestResult<T extends object>(
    fn: () => Promise<T>,
  ): Promise<({ ok: true } & T) | { ok: false; message: string }> {
    try {
      const value = await fn();
      return { ok: true, ...value };
    } catch (err) {
      const message =
        err instanceof PinterestAPIError || err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  }

  ipcMain.handle(
    'pinterest:scrape',
    (_event, { input, target }: { input: string; target?: number }) =>
      pinterestResult(async () => {
        const parsed = parsePinterestInput(input);
        const page = await scrapeFirstPage(parsed, target ?? 50);
        return { target: parsed, page };
      }),
  );

  ipcMain.handle(
    'pinterest:load-more',
    (
      _event,
      {
        target,
        bookmarks,
        desired,
      }: {
        target:
          | { kind: 'search'; query: string }
          | { kind: 'board'; username: string; slug: string };
        bookmarks: string[];
        desired?: number;
      },
    ) =>
      pinterestResult(async () => ({
        page: await pinterestLoadMore(target, bookmarks, desired ?? 50),
      })),
  );

  ipcMain.handle('pinterest:import-pin', (_event, { pin }: { pin: PinterestResult }) =>
    pinterestResult(async () => ({ result: await importPin(pin, { dbService }) })),
  );

  // Tracks in-flight bulk-import jobs so the renderer can cancel them.
  // Cleared on completion. Jobs don't survive app restart.
  const bulkImportJobs = new Map<string, AbortController>();

  ipcMain.handle(
    'pinterest:bulk-import-board',
    async (
      event,
      {
        username,
        slug,
        hideAiGenerated,
      }: { username: string; slug: string; hideAiGenerated: boolean },
    ) => {
      const jobId = randomUUID();
      const controller = new AbortController();
      bulkImportJobs.set(jobId, controller);

      const sender = event.sender;
      const send = (channel: string, payload: unknown) => {
        if (!sender.isDestroyed()) sender.send(channel, payload);
      };

      // Fire and forget — renderer listens on progress/complete channels.
      void (async () => {
        try {
          const summary = await bulkImportBoard(
            { jobId, username, slug, hideAiGenerated },
            {
              dbService,
              signal: controller.signal,
              onProgress: (p) => send('pinterest:bulk-import-progress', p),
            },
          );
          send('pinterest:bulk-import-complete', summary);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send('pinterest:bulk-import-complete', {
            jobId,
            status: 'error' as const,
            total: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
            error: message,
          });
        } finally {
          bulkImportJobs.delete(jobId);
        }
      })();

      return { ok: true as const, jobId };
    },
  );

  ipcMain.handle('pinterest:bulk-import-cancel', async (_event, { jobId }: { jobId: string }) => {
    const controller = bulkImportJobs.get(jobId);
    if (!controller) return { ok: false as const, message: 'Job not found' };
    controller.abort();
    return { ok: true as const };
  });

  ipcMain.handle('pinterest:reveal-import-folder', async () => {
    const dir = getImportFolder();
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { success: true };
  });

  ipcMain.handle('pinterest:get-import-folder', () => getImportFolder());
}
