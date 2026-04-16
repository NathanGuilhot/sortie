import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('sortieAPI', {
  // Image operations
  getImages: (limit?: number, offset?: number) => 
    ipcRenderer.invoke('get-images', { limit, offset }),
  
  searchImages: (query: string, limit?: number) =>
    ipcRenderer.invoke('search-images', { query, limit }),
  
  addFolder: (path: string) =>
    ipcRenderer.invoke('add-folder', { path }),
  
  scanFolder: (path: string) =>
    ipcRenderer.invoke('scan-folder', { path }),
  
  getFolders: () =>
    ipcRenderer.invoke('get-folders'),
  
  updateImageTags: (imageId: number, tags: string[]) =>
    ipcRenderer.invoke('update-image-tags', { imageId, tags }),

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
  
  // System
  getDatabasePath: () =>
    ipcRenderer.invoke('get-database-path'),

  pickFolder: () =>
    ipcRenderer.invoke('pick-folder'),
});

console.log('sortieAPI exposed');