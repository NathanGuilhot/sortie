import { contextBridge, ipcRenderer } from 'electron';
import type { FaceScanProgress, EmbedderStatus } from 'shared';

contextBridge.exposeInMainWorld('sortieAPI', {
  // Image operations
  getImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-images', { limit, offset }),

  getImage: (id: number) => ipcRenderer.invoke('get-image', { id }),

  reshuffleImages: () => ipcRenderer.invoke('reshuffle-images'),

  searchImages: (query: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke('search-images', { query, limit, offset }),

  getEmbedderStatus: (): Promise<EmbedderStatus> => ipcRenderer.invoke('get-embedder-status'),

  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) => {
    const handler = (_event: unknown, status: EmbedderStatus) => callback(status);
    ipcRenderer.on('embedder-status', handler);
    return () => {
      ipcRenderer.removeListener('embedder-status', handler);
    };
  },

  findSimilarImages: (imageId: number, limit?: number) =>
    ipcRenderer.invoke('find-similar-images', { imageId, limit }),

  getFavoriteImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-favorite-images', { limit, offset }),

  filterImages: (tags: string[], limit?: number, offset?: number) =>
    ipcRenderer.invoke('filter-images', { tags, limit, offset }),

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

  updateImageMetadata: (imageId: number, metadata: Record<string, unknown>) =>
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
    ipcRenderer.invoke('create-collection', { name, description }),
  organizeImages: () => ipcRenderer.invoke('organize-images'),

  // Watcher control
  watchFolder: (path: string) => ipcRenderer.invoke('watch-folder', { path }),

  unwatchFolder: (path: string) => ipcRenderer.invoke('unwatch-folder', { path }),

  setFolderFaceScanExclusion: (path: string, excluded: boolean) =>
    ipcRenderer.invoke('set-folder-face-scan-exclusion', { path, excluded }),

  recomputeEmbedding: (imageId: number) => ipcRenderer.invoke('recompute-embedding', { imageId }),

  // Cleanup / Duplicate detection
  computeMissingHashes: (opId: string) => ipcRenderer.invoke('compute-missing-hashes', { opId }),

  findDuplicateGroups: () => ipcRenderer.invoke('find-duplicate-groups'),

  dismissDuplicatePair: (imageId1: number, imageId2: number) =>
    ipcRenderer.invoke('dismiss-duplicate-pair', { imageId1, imageId2 }),

  deleteImage: (imageId: number) => ipcRenderer.invoke('delete-image', { imageId }),

  onHashProgress: (
    callback: (progress: { current: number; total: number; currentFile: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      progress: { current: number; total: number; currentFile: string },
    ) => callback(progress);
    ipcRenderer.on('hash-progress', handler);
    return () => {
      ipcRenderer.removeListener('hash-progress', handler);
    };
  },

  onScanProgress: (
    callback: (progress: { current: number; total: number; currentFile: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      progress: { current: number; total: number; currentFile: string },
    ) => callback(progress);
    ipcRenderer.on('scan-progress', handler);
    return () => {
      ipcRenderer.removeListener('scan-progress', handler);
    };
  },

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

  filterImagesByPerson: (personId: number, limit?: number, offset?: number) =>
    ipcRenderer.invoke('filter-images-by-person', { personId, limit, offset }),

  deletePerson: (personId: number) => ipcRenderer.invoke('delete-person', { personId }),

  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) => {
    const handler = (_event: unknown, progress: FaceScanProgress) => callback(progress);
    ipcRenderer.on('face-scan-progress', handler);
    return () => {
      ipcRenderer.removeListener('face-scan-progress', handler);
    };
  },

  // System
  resetDatabase: () => ipcRenderer.invoke('reset-database'),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),

  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // Folder availability (external drives)
  recheckFolderAvailability: (folderPath?: string) =>
    ipcRenderer.invoke('recheck-folder-availability', { path: folderPath }),

  onFolderAvailability: (callback: (change: { path: string; available: boolean }) => void) => {
    const handler = (_event: unknown, change: { path: string; available: boolean }) =>
      callback(change);
    ipcRenderer.on('folder-availability-changed', handler);
    return () => {
      ipcRenderer.removeListener('folder-availability-changed', handler);
    };
  },

  // App info
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', { url }),
    showAboutPanel: () => ipcRenderer.invoke('app:showAboutPanel'),
    onShowAbout: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('show-about', handler);
      return () => {
        ipcRenderer.removeListener('show-about', handler);
      };
    },
  },
});
