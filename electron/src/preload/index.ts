import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  FolderAvailabilityChange,
  FaceScanProgress,
  EmbedderStatus,
  InvokeArgsByKey,
  InvokeKey,
  InvokeResultByKey,
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
import { IPC_EVENTS, IPC_INVOKE_CHANNELS } from 'shared';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

function invoke<K extends InvokeKey>(
  key: K,
  args: InvokeArgsByKey[K],
): Promise<InvokeResultByKey[K]> {
  return ipcRenderer.invoke(IPC_INVOKE_CHANNELS[key], args) as Promise<InvokeResultByKey[K]>;
}

const sortieAPI: SortieAPI = {
  // Image operations
  getImages: (limit?: number, offset?: number) =>
    invoke('getImages', { limit, offset }),

  getImage: (id: number) => invoke('getImage', { id }),

  reshuffleImages: () => invoke('reshuffleImages', undefined),

  query: (query) => invoke('queryImages', query),

  getEmbedderStatus: (): Promise<EmbedderStatus> => invoke('getEmbedderStatus', undefined),

  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) =>
    subscribe<EmbedderStatus>(IPC_EVENTS.embedderStatus, callback),

  findSimilarImages: (imageId: number, limit?: number) =>
    invoke('findSimilarImages', { imageId, limit }),

  addFolder: (path: string) => invoke('addFolder', { path }),

  scanFolder: (path: string, opId: string) => invoke('scanFolder', { path, opId }),

  cancelOperation: (opId: string) => invoke('cancelOperation', { opId }),

  getFolders: () => invoke('getFolders', undefined),

  getFoldersWithStats: () => invoke('getFoldersWithStats', undefined),

  removeFolder: (path: string) => invoke('removeFolder', { path }),

  getAllTags: () => invoke('getAllTags', undefined),
  getTagsWithCounts: () => invoke('getTagsWithCounts', undefined),

  updateImageTags: (imageId: number, tags: string[]) =>
    invoke('updateImageTags', { imageId, tags }),

  hideImage: (imageId: number) => invoke('hideImage', { imageId }),

  updateImageMetadata: (imageId, metadata) =>
    invoke('updateImageMetadata', { imageId, metadata }),

  getLinkPreview: (url: string) => invoke('getLinkPreview', { url }),
  fetchLinkPreview: (url: string) => invoke('fetchLinkPreview', { url }),

  // Suggestions
  getSuggestions: (imageId: number) => invoke('getSuggestions', { imageId }),
  dismissSuggestion: (imageId: number, tagId: number) =>
    invoke('dismissSuggestion', { imageId, tagId }),

  // Boards
  boards: {
    list: () => invoke('boardsList', undefined),
    get: (tagId: number) => invoke('boardsGet', { tagId }),
    getImages: (tagId: number, limit?: number, offset?: number) =>
      invoke('boardsGetImages', { tagId, limit, offset }),
    getImageSuggestions: (tagId: number) =>
      invoke('boardsGetImageSuggestions', { tagId }),
    reorder: (tagId: number, orderedImageIds: number[]) =>
      invoke('boardsReorder', { tagId, orderedImageIds }),
    addImage: (imageId: number, tagId: number) =>
      invoke('boardsAddImage', { imageId, tagId }),
    removeImage: (imageId: number, tagId: number) =>
      invoke('boardsRemoveImage', { imageId, tagId }),
    create: (name: string, color?: string) => invoke('boardsCreate', { name, color }),
    rename: (tagId: number, name: string) => invoke('boardsRename', { tagId, name }),
    setColor: (tagId: number, color: string) =>
      invoke('boardsSetColor', { tagId, color }),
    delete: (tagId: number) => invoke('boardsDelete', { tagId }),
  },

  // Collections
  getCollections: () => invoke('getCollections', undefined),
  createCollection: (name: string, description?: string) =>
    invoke('createCollection', { name, description })
      .then(({ collectionId }: { collectionId: number }) => collectionId),
  organizeImages: () =>
    invoke('organizeImages', undefined)
      .then(({ collectionIds }: { collectionIds: number[] }) => collectionIds),

  // Watcher control
  watchFolder: (path: string) => invoke('watchFolder', { path }),

  unwatchFolder: (path: string) => invoke('unwatchFolder', { path }),

  setFolderFaceScanExclusion: (path: string, excluded: boolean) =>
    invoke('setFolderFaceScanExclusion', { path, excluded }),

  recomputeEmbedding: (imageId: number) => invoke('recomputeEmbedding', { imageId }),

  // Palette
  recomputePalette: (imageId: number) => invoke('recomputePalette', { imageId }),
  computeMissingPalettes: (opId: string) =>
    invoke('computeMissingPalettes', { opId }),
  onPaletteProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.paletteProgress, callback),

  // Cleanup / Duplicate detection
  computeMissingHashes: (opId: string) => invoke('computeMissingHashes', { opId }),

  findDuplicateGroups: () => invoke('findDuplicateGroups', undefined),

  dismissDuplicatePair: (imageId1: number, imageId2: number) =>
    invoke('dismissDuplicatePair', { imageId1, imageId2 }),

  deleteImage: (imageId: number) => invoke('deleteImage', { imageId }),

  onHashProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.hashProgress, callback),

  onScanProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.scanProgress, callback),

  // File actions
  revealInFinder: (filePath: string) => invoke('revealInFinder', { filePath }),
  copyImageToClipboard: (filePath: string) =>
    invoke('copyImageToClipboard', { filePath }),
  backfillExif: (opId: string) => invoke('backfillExif', { opId }),

  // Face Detection / People
  getPersons: () => invoke('getPersons', undefined),

  getPersonImages: (personId: number, limit?: number, offset?: number) =>
    invoke('getPersonImages', { personId, limit, offset }),

  getPersonThumbnails: (personIds: number[]) => invoke('getPersonThumbnails', { personIds }),

  renamePerson: (personId: number, name: string) =>
    invoke('renamePerson', { personId, name }),

  mergePersons: (keepPersonId: number, mergePersonId: number) =>
    invoke('mergePersons', { keepPersonId, mergePersonId }),

  splitFaceFromPerson: (faceId: number) => invoke('splitFaceFromPerson', { faceId }),

  getImageFaces: (imageId: number) => invoke('getImageFaces', { imageId }),

  setPersonThumbnail: (personId: number, faceId: number) =>
    invoke('setPersonThumbnail', { personId, faceId }),

  processFaces: (opId: string) => invoke('processFaces', { opId }),
  resetFaceData: () => invoke('resetFaceData', undefined),

  deletePerson: (personId: number) => invoke('deletePerson', { personId }),

  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) =>
    subscribe<FaceScanProgress>(IPC_EVENTS.faceScanProgress, callback),

  // System
  resetDatabase: () => invoke('resetDatabase', undefined),
  getDatabasePath: () => invoke('getDatabasePath', undefined),

  pickFolder: () => invoke('pickFolder', undefined),

  // App settings (key-value, persisted in sortie.db)
  settings: {
    get: (key): Promise<string | null> => invoke('settingsGet', { key }),
    set: (key, value): Promise<{ success: boolean }> => invoke('settingsSet', { key, value }),
  },

  suggestDefaultPhotoFolder: (): Promise<SuggestDefaultPhotoFolderResult> =>
    invoke('suggestDefaultPhotoFolder', undefined),

  // Folder availability (external drives)
  recheckFolderAvailability: (folderPath?: string) =>
    invoke('recheckFolderAvailability', { path: folderPath }),

  onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) =>
    subscribe<FolderAvailabilityChange>(IPC_EVENTS.folderAvailabilityChanged, callback),

  // App info
  app: {
    getVersion: (): Promise<string> => invoke('appGetVersion', undefined),
    openExternal: (url: string) => invoke('appOpenExternal', { url }),
    showAboutPanel: () => invoke('appShowAboutPanel', undefined),
    onShowAbout: (callback: () => void) => subscribe<void>(IPC_EVENTS.showAbout, () => callback()),
  },

  ocr: {
    get: (imageId: number): Promise<OcrResult> => invoke('ocrGet', { imageId }),
    ensure: (
      imageId: number,
    ): Promise<
      { available: false } | { available: true; state: OcrResult }
    > => invoke('ocrEnsure', { imageId }),
    onUpdated: (cb: (payload: OcrUpdatePayload) => void) =>
      subscribe<OcrUpdatePayload>(IPC_EVENTS.ocrUpdated, cb),
  },

  pinterest: {
    scrape: (input: string, target?: number): Promise<PinterestScrapeResponse> =>
      invoke('pinterestScrape', { input, target }),
    loadMore: (
      target: PinterestTarget,
      bookmarks: string[],
      desired?: number,
    ): Promise<PinterestLoadMoreResponse> =>
      invoke('pinterestLoadMore', { target, bookmarks, desired }),
    importPin: (pin: PinterestResult): Promise<PinterestImportResponse> =>
      invoke('pinterestImportPin', { pin }),
    startBulkImport: (args: {
      username: string;
      slug: string;
      hideAiGenerated: boolean;
    }) => invoke('pinterestStartBulkImport', args),
    cancelBulkImport: (jobId: string): Promise<PinterestBulkImportCancelResponse> =>
      invoke('pinterestCancelBulkImport', { jobId }),
    onBulkImportProgress: (cb: (progress: PinterestBulkImportProgress) => void) =>
      subscribe<PinterestBulkImportProgress>(IPC_EVENTS.pinterestBulkImportProgress, cb),
    onBulkImportComplete: (cb: (summary: PinterestBulkImportSummary) => void) =>
      subscribe<PinterestBulkImportSummary>(IPC_EVENTS.pinterestBulkImportComplete, cb),
    revealImportFolder: () => invoke('pinterestRevealImportFolder', undefined),
    getImportFolder: (): Promise<string> => invoke('pinterestGetImportFolder', undefined),
  },
};

contextBridge.exposeInMainWorld('sortieAPI', sortieAPI);
