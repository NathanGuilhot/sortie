import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sortieAPI', {
  // Image operations
  getImages: (limit?: number, offset?: number) =>
    ipcRenderer.invoke('get-images', { limit, offset }),

  searchImages: (query: string, limit?: number) =>
    ipcRenderer.invoke('search-images', { query, limit }),

  filterImages: (tags: string[], limit?: number, offset?: number) =>
    ipcRenderer.invoke('filter-images', { tags, limit, offset }),

  addFolder: (path: string) =>
    ipcRenderer.invoke('add-folder', { path }),

  scanFolder: (path: string) =>
    ipcRenderer.invoke('scan-folder', { path }),

  getFolders: () =>
    ipcRenderer.invoke('get-folders'),

  getAllTags: () =>
    ipcRenderer.invoke('get-all-tags'),

  updateImageTags: (imageId: number, tags: string[]) =>
    ipcRenderer.invoke('update-image-tags', { imageId, tags }),

  hideImage: (imageId: number) =>
    ipcRenderer.invoke('hide-image', { imageId }),

  updateImageMetadata: (imageId: number, metadata: Record<string, unknown>) =>
    ipcRenderer.invoke('update-image-metadata', { imageId, metadata }),

  // Suggestions
  getSuggestions: (imageId: number) => ipcRenderer.invoke('get-suggestions', { imageId }),
  dismissSuggestion: (imageId: number, tagId: number) => ipcRenderer.invoke('dismiss-suggestion', { imageId, tagId }),

  // Collections
  getCollections: () => ipcRenderer.invoke('get-collections'),
  createCollection: (name: string, description?: string) => ipcRenderer.invoke('create-collection', { name, description }),
  organizeImages: () => ipcRenderer.invoke('organize-images'),

  // Watcher control
  watchFolder: (path: string) =>
    ipcRenderer.invoke('watch-folder', { path }),

  unwatchFolder: (path: string) =>
    ipcRenderer.invoke('unwatch-folder', { path }),

  recomputeEmbedding: (imageId: number) =>
    ipcRenderer.invoke('recompute-embedding', { imageId }),

  // System
  getDatabasePath: () =>
    ipcRenderer.invoke('get-database-path'),

  pickFolder: () =>
    ipcRenderer.invoke('pick-folder'),
});