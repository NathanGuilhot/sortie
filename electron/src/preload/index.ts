import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  FolderAvailabilityChange,
  FaceScanProgress,
  EmbedderStatus,
  OcrResult,
  OcrUpdatePayload,
  PinterestBulkImportCancelResponse,
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestImportResponse,
  PinterestLoadMoreResponse,
  PinterestResult,
  PinterestScrapeResponse,
  PinterestTarget,
  SortieAPI,
  SortieProgress,
  SuggestDefaultPhotoFolderResult,
} from 'shared';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const sortieAPI: SortieAPI = {
  // Image operations
  getImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-images', { limit, offset }),

  getImage: (id: number) => ipcRenderer.invoke('get-image', { id }),

  reshuffleImages: () => ipcRenderer.invoke('reshuffle-images'),

  query: (query) => ipcRenderer.invoke('query-images', query),

  getEmbedderStatus: (): Promise<EmbedderStatus> => ipcRenderer.invoke('get-embedder-status'),

  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) =>
    subscribe<EmbedderStatus>('embedder-status', callback),

  findSimilarImages: (imageId: number, limit?: number) =>
    ipcRenderer.invoke('find-similar-images', { imageId, limit }),

  addFolder: (path: string) => ipcRenderer.invoke('add-folder', { path }),

  scanFolder: (path: string, opId: string) => ipcRenderer.invoke('scan-folder', { path, opId }),

  cancelOperation: (opId: string) => ipcRenderer.invoke('cancel-operation', { opId }),

  getFolders: () => ipcRenderer.invoke('get-folders'),

  getFoldersWithStats: () => ipcRenderer.invoke('get-folders-with-stats'),

  removeFolder: (path: string) => ipcRenderer.invoke('remove-folder', { path }),

  getAllTags: () => ipcRenderer.invoke('get-all-tags'),
  getTagsWithCounts: () => ipcRenderer.invoke('get-tags-with-counts'),

  updateImageTags: (imageId: number, tags: string[]) =>
    ipcRenderer.invoke('update-image-tags', { imageId, tags }),

  hideImage: (imageId: number) => ipcRenderer.invoke('hide-image', { imageId }),

  updateImageMetadata: (imageId, metadata) =>
    ipcRenderer.invoke('update-image-metadata', { imageId, metadata }),

  getLinkPreview: (url: string) => ipcRenderer.invoke('get-link-preview', { url }),
  fetchLinkPreview: (url: string) => ipcRenderer.invoke('fetch-link-preview', { url }),

  // Suggestions
  getSuggestions: (imageId: number) => ipcRenderer.invoke('get-suggestions', { imageId }),
  dismissSuggestion: (imageId: number, tagId: number) =>
    ipcRenderer.invoke('dismiss-suggestion', { imageId, tagId }),

  // Boards
  boards: {
    list: () => ipcRenderer.invoke('boards:list'),
    get: (tagId: number) => ipcRenderer.invoke('boards:get', { tagId }),
    getImages: (tagId: number, limit?: number, offset?: number) =>
      ipcRenderer.invoke('boards:get-images', { tagId, limit, offset }),
    getImageSuggestions: (tagId: number) =>
      ipcRenderer.invoke('boards:get-image-suggestions', { tagId }),
    reorder: (tagId: number, orderedImageIds: number[]) =>
      ipcRenderer.invoke('boards:reorder', { tagId, orderedImageIds }),
    addImage: (imageId: number, tagId: number) =>
      ipcRenderer.invoke('boards:add-image', { imageId, tagId }),
    removeImage: (imageId: number, tagId: number) =>
      ipcRenderer.invoke('boards:remove-image', { imageId, tagId }),
    create: (name: string, color?: string) => ipcRenderer.invoke('boards:create', { name, color }),
    rename: (tagId: number, name: string) => ipcRenderer.invoke('boards:rename', { tagId, name }),
    setColor: (tagId: number, color: string) =>
      ipcRenderer.invoke('boards:set-color', { tagId, color }),
    delete: (tagId: number) => ipcRenderer.invoke('boards:delete', { tagId }),
  },

  // Collections
  getCollections: () => ipcRenderer.invoke('get-collections'),
  createCollection: (name: string, description?: string) =>
    ipcRenderer
      .invoke('create-collection', { name, description })
      .then(({ collectionId }: { collectionId: number }) => collectionId),
  organizeImages: () =>
    ipcRenderer
      .invoke('organize-images')
      .then(({ collectionIds }: { collectionIds: number[] }) => collectionIds),

  // Watcher control
  watchFolder: (path: string) => ipcRenderer.invoke('watch-folder', { path }),

  unwatchFolder: (path: string) => ipcRenderer.invoke('unwatch-folder', { path }),

  setFolderFaceScanExclusion: (path: string, excluded: boolean) =>
    ipcRenderer.invoke('set-folder-face-scan-exclusion', { path, excluded }),

  recomputeEmbedding: (imageId: number) => ipcRenderer.invoke('recompute-embedding', { imageId }),

  // Palette
  recomputePalette: (imageId: number) => ipcRenderer.invoke('recompute-palette', { imageId }),
  computeMissingPalettes: (opId: string) =>
    ipcRenderer.invoke('compute-missing-palettes', { opId }),
  onPaletteProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>('palette-progress', callback),

  // Cleanup / Duplicate detection
  computeMissingHashes: (opId: string) => ipcRenderer.invoke('compute-missing-hashes', { opId }),

  findDuplicateGroups: () => ipcRenderer.invoke('find-duplicate-groups'),

  dismissDuplicatePair: (imageId1: number, imageId2: number) =>
    ipcRenderer.invoke('dismiss-duplicate-pair', { imageId1, imageId2 }),

  deleteImage: (imageId: number) => ipcRenderer.invoke('delete-image', { imageId }),

  onHashProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>('hash-progress', callback),

  onScanProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>('scan-progress', callback),

  // File actions
  revealInFinder: (filePath: string) => ipcRenderer.invoke('reveal-in-finder', { filePath }),
  copyImageToClipboard: (filePath: string) =>
    ipcRenderer.invoke('copy-image-to-clipboard', { filePath }),
  backfillExif: (opId: string) => ipcRenderer.invoke('backfill-exif', { opId }),

  // Face Detection / People
  getPersons: () => ipcRenderer.invoke('get-persons'),

  getPersonImages: (personId: number, limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-person-images', { personId, limit, offset }),

  renamePerson: (personId: number, name: string) =>
    ipcRenderer.invoke('rename-person', { personId, name }),

  mergePersons: (keepPersonId: number, mergePersonId: number) =>
    ipcRenderer.invoke('merge-persons', { keepPersonId, mergePersonId }),

  splitFaceFromPerson: (faceId: number) => ipcRenderer.invoke('split-face-from-person', { faceId }),

  getImageFaces: (imageId: number) => ipcRenderer.invoke('get-image-faces', { imageId }),

  setPersonThumbnail: (personId: number, faceId: number) =>
    ipcRenderer.invoke('set-person-thumbnail', { personId, faceId }),

  processFaces: (opId: string) => ipcRenderer.invoke('process-faces', { opId }),
  resetFaceData: () => ipcRenderer.invoke('reset-face-data'),

  deletePerson: (personId: number) => ipcRenderer.invoke('delete-person', { personId }),

  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) =>
    subscribe<FaceScanProgress>('face-scan-progress', callback),

  // System
  resetDatabase: () => ipcRenderer.invoke('reset-database'),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),

  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // App settings (key-value, persisted in sortie.db)
  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('settings:get', { key }),
    set: (key: string, value: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('settings:set', { key, value }),
  },

  suggestDefaultPhotoFolder: (): Promise<SuggestDefaultPhotoFolderResult> =>
    ipcRenderer.invoke('suggest-default-photo-folder'),

  // Folder availability (external drives)
  recheckFolderAvailability: (folderPath?: string) =>
    ipcRenderer.invoke('recheck-folder-availability', { path: folderPath }),

  onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) =>
    subscribe<FolderAvailabilityChange>('folder-availability-changed', callback),

  // App info
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', { url }),
    showAboutPanel: () => ipcRenderer.invoke('app:showAboutPanel'),
    onShowAbout: (callback: () => void) => subscribe<void>('show-about', () => callback()),
  },

  ocr: {
    get: (imageId: number): Promise<OcrResult> => ipcRenderer.invoke('ocr:get', { imageId }),
    ensure: (
      imageId: number,
    ): Promise<
      { available: false } | { available: true; state: OcrResult }
    > => ipcRenderer.invoke('ocr:ensure', { imageId }),
    onUpdated: (cb: (payload: OcrUpdatePayload) => void) =>
      subscribe<OcrUpdatePayload>('ocr-updated', cb),
  },

  pinterest: {
    scrape: (input: string, target?: number): Promise<PinterestScrapeResponse> =>
      ipcRenderer.invoke('pinterest:scrape', { input, target }),
    loadMore: (
      target: PinterestTarget,
      bookmarks: string[],
      desired?: number,
    ): Promise<PinterestLoadMoreResponse> =>
      ipcRenderer.invoke('pinterest:load-more', { target, bookmarks, desired }),
    importPin: (pin: PinterestResult): Promise<PinterestImportResponse> =>
      ipcRenderer.invoke('pinterest:import-pin', { pin }),
    startBulkImport: (args: {
      username: string;
      slug: string;
      hideAiGenerated: boolean;
    }) =>
      ipcRenderer.invoke('pinterest:bulk-import-board', args),
    cancelBulkImport: (jobId: string): Promise<PinterestBulkImportCancelResponse> =>
      ipcRenderer.invoke('pinterest:bulk-import-cancel', { jobId }),
    onBulkImportProgress: (cb: (progress: PinterestBulkImportProgress) => void) =>
      subscribe<PinterestBulkImportProgress>('pinterest:bulk-import-progress', cb),
    onBulkImportComplete: (cb: (summary: PinterestBulkImportSummary) => void) =>
      subscribe<PinterestBulkImportSummary>('pinterest:bulk-import-complete', cb),
    revealImportFolder: () => ipcRenderer.invoke('pinterest:reveal-import-folder'),
    getImportFolder: (): Promise<string> => ipcRenderer.invoke('pinterest:get-import-folder'),
  },
};

contextBridge.exposeInMainWorld('sortieAPI', sortieAPI);
