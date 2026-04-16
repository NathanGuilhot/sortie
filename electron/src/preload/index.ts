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

  // System
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),

  pickFolder: () => ipcRenderer.invoke('pick-folder'),
});
