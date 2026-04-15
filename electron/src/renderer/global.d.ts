// Global TypeScript declarations for Sortie Electron app

import { TagSuggestion, Collection } from 'pipeline';

export {};

declare global {
  interface Window {
    sortieAPI: {
      // Image operations
      getImages: (limit?: number, offset?: number) => Promise<any[]>;
      searchImages: (query: string, limit?: number) => Promise<any[]>;
      addFolder: (path: string) => Promise<number>;
      scanFolder: (path: string) => Promise<number>;
      getFolders: () => Promise<any[]>;
      updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
      // Suggestions
      getSuggestions: (imageId: number) => Promise<TagSuggestion[]>;
      dismissSuggestion: (imageId: number, tagId: number) => Promise<void>;
      // Collections
      getCollections: () => Promise<Collection[]>;
      createCollection: (name: string, description?: string) => Promise<number>;
      organizeImages: () => Promise<number[]>;
      // Watcher control
      watchFolder: (path: string) => Promise<{ watching: boolean }>;
      unwatchFolder: (path: string) => Promise<{ watching: boolean }>;
      // System
      getDatabasePath: () => Promise<string>;
    };
  }
}