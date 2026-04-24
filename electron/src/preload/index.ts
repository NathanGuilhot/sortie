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
import { IPC_CHANNELS, IPC_EVENTS } from 'shared';

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
    ipcRenderer.invoke(IPC_CHANNELS.getImages, { limit, offset }),

  getImage: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.getImage, { id }),

  reshuffleImages: () => ipcRenderer.invoke(IPC_CHANNELS.reshuffleImages),

  query: (query) => ipcRenderer.invoke(IPC_CHANNELS.queryImages, query),

  getEmbedderStatus: (): Promise<EmbedderStatus> => ipcRenderer.invoke(IPC_CHANNELS.getEmbedderStatus),

  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) =>
    subscribe<EmbedderStatus>(IPC_EVENTS.embedderStatus, callback),

  findSimilarImages: (imageId: number, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.findSimilarImages, { imageId, limit }),

  addFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.addFolder, { path }),

  scanFolder: (path: string, opId: string) => ipcRenderer.invoke(IPC_CHANNELS.scanFolder, { path, opId }),

  cancelOperation: (opId: string) => ipcRenderer.invoke(IPC_CHANNELS.cancelOperation, { opId }),

  getFolders: () => ipcRenderer.invoke(IPC_CHANNELS.getFolders),

  getFoldersWithStats: () => ipcRenderer.invoke(IPC_CHANNELS.getFoldersWithStats),

  removeFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.removeFolder, { path }),

  getAllTags: () => ipcRenderer.invoke(IPC_CHANNELS.getAllTags),
  getTagsWithCounts: () => ipcRenderer.invoke(IPC_CHANNELS.getTagsWithCounts),

  updateImageTags: (imageId: number, tags: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateImageTags, { imageId, tags }),

  hideImage: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.hideImage, { imageId }),

  updateImageMetadata: (imageId, metadata) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateImageMetadata, { imageId, metadata }),

  getLinkPreview: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.getLinkPreview, { url }),
  fetchLinkPreview: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.fetchLinkPreview, { url }),

  // Suggestions
  getSuggestions: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.getSuggestions, { imageId }),
  dismissSuggestion: (imageId: number, tagId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.dismissSuggestion, { imageId, tagId }),

  // Boards
  boards: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.boards.list),
    get: (tagId: number) => ipcRenderer.invoke(IPC_CHANNELS.boards.get, { tagId }),
    getImages: (tagId: number, limit?: number, offset?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.getImages, { tagId, limit, offset }),
    getImageSuggestions: (tagId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.getImageSuggestions, { tagId }),
    reorder: (tagId: number, orderedImageIds: number[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.reorder, { tagId, orderedImageIds }),
    addImage: (imageId: number, tagId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.addImage, { imageId, tagId }),
    removeImage: (imageId: number, tagId: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.removeImage, { imageId, tagId }),
    create: (name: string, color?: string) => ipcRenderer.invoke(IPC_CHANNELS.boards.create, { name, color }),
    rename: (tagId: number, name: string) => ipcRenderer.invoke(IPC_CHANNELS.boards.rename, { tagId, name }),
    setColor: (tagId: number, color: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.boards.setColor, { tagId, color }),
    delete: (tagId: number) => ipcRenderer.invoke(IPC_CHANNELS.boards.delete, { tagId }),
  },

  // Collections
  getCollections: () => ipcRenderer.invoke(IPC_CHANNELS.getCollections),
  createCollection: (name: string, description?: string) =>
    ipcRenderer
      .invoke(IPC_CHANNELS.createCollection, { name, description })
      .then(({ collectionId }: { collectionId: number }) => collectionId),
  organizeImages: () =>
    ipcRenderer
      .invoke(IPC_CHANNELS.organizeImages)
      .then(({ collectionIds }: { collectionIds: number[] }) => collectionIds),

  // Watcher control
  watchFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.watchFolder, { path }),

  unwatchFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.unwatchFolder, { path }),

  setFolderFaceScanExclusion: (path: string, excluded: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setFolderFaceScanExclusion, { path, excluded }),

  recomputeEmbedding: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.recomputeEmbedding, { imageId }),

  // Palette
  recomputePalette: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.recomputePalette, { imageId }),
  computeMissingPalettes: (opId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.computeMissingPalettes, { opId }),
  onPaletteProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.paletteProgress, callback),

  // Cleanup / Duplicate detection
  computeMissingHashes: (opId: string) => ipcRenderer.invoke(IPC_CHANNELS.computeMissingHashes, { opId }),

  findDuplicateGroups: () => ipcRenderer.invoke(IPC_CHANNELS.findDuplicateGroups),

  dismissDuplicatePair: (imageId1: number, imageId2: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.dismissDuplicatePair, { imageId1, imageId2 }),

  deleteImage: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.deleteImage, { imageId }),

  onHashProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.hashProgress, callback),

  onScanProgress: (callback: (progress: SortieProgress) => void) =>
    subscribe<SortieProgress>(IPC_EVENTS.scanProgress, callback),

  // File actions
  revealInFinder: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.revealInFinder, { filePath }),
  copyImageToClipboard: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyImageToClipboard, { filePath }),
  backfillExif: (opId: string) => ipcRenderer.invoke(IPC_CHANNELS.backfillExif, { opId }),

  // Face Detection / People
  getPersons: () => ipcRenderer.invoke(IPC_CHANNELS.getPersons),

  getPersonImages: (personId: number, limit?: number, offset?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.getPersonImages, { personId, limit, offset }),

  renamePerson: (personId: number, name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.renamePerson, { personId, name }),

  mergePersons: (keepPersonId: number, mergePersonId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.mergePersons, { keepPersonId, mergePersonId }),

  splitFaceFromPerson: (faceId: number) => ipcRenderer.invoke(IPC_CHANNELS.splitFaceFromPerson, { faceId }),

  getImageFaces: (imageId: number) => ipcRenderer.invoke(IPC_CHANNELS.getImageFaces, { imageId }),

  setPersonThumbnail: (personId: number, faceId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.setPersonThumbnail, { personId, faceId }),

  processFaces: (opId: string) => ipcRenderer.invoke(IPC_CHANNELS.processFaces, { opId }),
  resetFaceData: () => ipcRenderer.invoke(IPC_CHANNELS.resetFaceData),

  deletePerson: (personId: number) => ipcRenderer.invoke(IPC_CHANNELS.deletePerson, { personId }),

  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) =>
    subscribe<FaceScanProgress>(IPC_EVENTS.faceScanProgress, callback),

  // System
  resetDatabase: () => ipcRenderer.invoke(IPC_CHANNELS.resetDatabase),
  getDatabasePath: () => ipcRenderer.invoke(IPC_CHANNELS.getDatabasePath),

  pickFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickFolder),

  // App settings (key-value, persisted in sortie.db)
  settings: {
    get: (key): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.settings.get, { key }),
    set: (key, value): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.set, { key, value }),
  },

  suggestDefaultPhotoFolder: (): Promise<SuggestDefaultPhotoFolderResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.suggestDefaultPhotoFolder),

  // Folder availability (external drives)
  recheckFolderAvailability: (folderPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.recheckFolderAvailability, { path: folderPath }),

  onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) =>
    subscribe<FolderAvailabilityChange>(IPC_EVENTS.folderAvailabilityChanged, callback),

  // App info
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.app.getVersion),
    openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.app.openExternal, { url }),
    showAboutPanel: () => ipcRenderer.invoke(IPC_CHANNELS.app.showAboutPanel),
    onShowAbout: (callback: () => void) => subscribe<void>(IPC_EVENTS.showAbout, () => callback()),
  },

  ocr: {
    get: (imageId: number): Promise<OcrResult> => ipcRenderer.invoke(IPC_CHANNELS.ocr.get, { imageId }),
    ensure: (
      imageId: number,
    ): Promise<
      { available: false } | { available: true; state: OcrResult }
    > => ipcRenderer.invoke(IPC_CHANNELS.ocr.ensure, { imageId }),
    onUpdated: (cb: (payload: OcrUpdatePayload) => void) =>
      subscribe<OcrUpdatePayload>(IPC_EVENTS.ocrUpdated, cb),
  },

  pinterest: {
    scrape: (input: string, target?: number): Promise<PinterestScrapeResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.pinterest.scrape, { input, target }),
    loadMore: (
      target: PinterestTarget,
      bookmarks: string[],
      desired?: number,
    ): Promise<PinterestLoadMoreResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.pinterest.loadMore, { target, bookmarks, desired }),
    importPin: (pin: PinterestResult): Promise<PinterestImportResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.pinterest.importPin, { pin }),
    startBulkImport: (args: {
      username: string;
      slug: string;
      hideAiGenerated: boolean;
    }) =>
      ipcRenderer.invoke(IPC_CHANNELS.pinterest.startBulkImport, args),
    cancelBulkImport: (jobId: string): Promise<PinterestBulkImportCancelResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.pinterest.cancelBulkImport, { jobId }),
    onBulkImportProgress: (cb: (progress: PinterestBulkImportProgress) => void) =>
      subscribe<PinterestBulkImportProgress>(IPC_EVENTS.pinterestBulkImportProgress, cb),
    onBulkImportComplete: (cb: (summary: PinterestBulkImportSummary) => void) =>
      subscribe<PinterestBulkImportSummary>(IPC_EVENTS.pinterestBulkImportComplete, cb),
    revealImportFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pinterest.revealImportFolder),
    getImportFolder: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.pinterest.getImportFolder),
  },
};

contextBridge.exposeInMainWorld('sortieAPI', sortieAPI);
