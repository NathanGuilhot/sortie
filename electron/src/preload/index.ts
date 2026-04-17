import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sortieAPI', {
  // Image operations
  getImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-images', { limit, offset }),

  searchImages: (query: string, limit?: number) =>
    ipcRenderer.invoke('search-images', { query, limit }),

  findSimilarImages: (imageId: number, limit?: number) =>
    ipcRenderer.invoke('find-similar-images', { imageId, limit }),

  getFavoriteImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-favorite-images', { limit, offset }),

  filterImages: (tags: string[], limit?: number, offset?: number) =>
    ipcRenderer.invoke('filter-images', { tags, limit, offset }),

  addFolder: (path: string) => ipcRenderer.invoke('add-folder', { path }),

  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', { path }),

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

  // Suggestions
  getSuggestions: (imageId: number) => ipcRenderer.invoke('get-suggestions', { imageId }),
  dismissSuggestion: (imageId: number, tagId: number) =>
    ipcRenderer.invoke('dismiss-suggestion', { imageId, tagId }),

  // Collections
  getCollections: () => ipcRenderer.invoke('get-collections'),
  createCollection: (name: string, description?: string) =>
    ipcRenderer.invoke('create-collection', { name, description }),
  organizeImages: () => ipcRenderer.invoke('organize-images'),

  // Watcher control
  watchFolder: (path: string) => ipcRenderer.invoke('watch-folder', { path }),

  unwatchFolder: (path: string) => ipcRenderer.invoke('unwatch-folder', { path }),

  recomputeEmbedding: (imageId: number) => ipcRenderer.invoke('recompute-embedding', { imageId }),

  // Cleanup / Duplicate detection
  computeMissingHashes: () => ipcRenderer.invoke('compute-missing-hashes'),

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
  backfillExif: () => ipcRenderer.invoke('backfill-exif'),

  // Face Detection / People
  getPersons: () => ipcRenderer.invoke('get-persons'),

  getPersonImages: (personId: number, limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-person-images', { personId, limit, offset }),

  renamePerson: (personId: number, name: string) =>
    ipcRenderer.invoke('rename-person', { personId, name }),

  mergePersons: (keepPersonId: number, mergePersonId: number) =>
    ipcRenderer.invoke('merge-persons', { keepPersonId, mergePersonId }),

  splitFaceFromPerson: (faceId: number) =>
    ipcRenderer.invoke('split-face-from-person', { faceId }),

  getImageFaces: (imageId: number) => ipcRenderer.invoke('get-image-faces', { imageId }),

  setPersonThumbnail: (personId: number, faceId: number) =>
    ipcRenderer.invoke('set-person-thumbnail', { personId, faceId }),

  processFaces: () => ipcRenderer.invoke('process-faces'),
  resetFaceData: () => ipcRenderer.invoke('reset-face-data'),

  filterImagesByPerson: (personId: number, limit?: number, offset?: number) =>
    ipcRenderer.invoke('filter-images-by-person', { personId, limit, offset }),

  deletePerson: (personId: number) => ipcRenderer.invoke('delete-person', { personId }),

  onFaceScanProgress: (
    callback: (progress: { current: number; total: number; currentFile: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      progress: { current: number; total: number; currentFile: string },
    ) => callback(progress);
    ipcRenderer.on('face-scan-progress', handler);
    return () => {
      ipcRenderer.removeListener('face-scan-progress', handler);
    };
  },

  // System
  resetDatabase: () => ipcRenderer.invoke('reset-database'),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),

  pickFolder: () => ipcRenderer.invoke('pick-folder'),
});
