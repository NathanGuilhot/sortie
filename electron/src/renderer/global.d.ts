// Global TypeScript declarations for Sortie Electron app

import { TagSuggestion, Collection } from 'pipeline';
import { FolderWithStats } from 'shared';

export {};

declare global {
  interface Window {
    sortieAPI: {
      // Image operations
      getImages: (limit?: number, offset?: number) => Promise<any[]>;
      searchImages: (query: string, limit?: number) => Promise<any[]>;
      findSimilarImages: (imageId: number, limit?: number) => Promise<any[]>;
      getFavoriteImages: (limit?: number, offset?: number) => Promise<any[]>;
      filterImages: (tags: string[], limit?: number, offset?: number) => Promise<any[]>;
      addFolder: (path: string) => Promise<number>;
      scanFolder: (path: string) => Promise<number>;
      getFolders: () => Promise<any[]>;
      getFoldersWithStats: () => Promise<FolderWithStats[]>;
      removeFolder: (path: string) => Promise<{ success: boolean }>;
      getAllTags: () => Promise<Array<{ id: number; name: string; category: string | null; color: string; created_at: string }>>;
      updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
      hideImage: (imageId: number) => Promise<void>;
      updateImageMetadata: (imageId: number, metadata: {
        description?: string;
        favorite?: boolean;
        captured_at?: string | null;
        city?: string | null;
        country?: string | null;
      }) => Promise<void>;
      // Suggestions
      getSuggestions: (imageId: number) => Promise<TagSuggestion[]>;
      dismissSuggestion: (imageId: number, tagId: number) => Promise<void>;
      // Collections
      getCollections: () => Promise<Collection[]>;
      createCollection: (name: string, description?: string) => Promise<number>;
      organizeImages: () => Promise<number[]>;
      // Embedding
      recomputeEmbedding: (imageId: number) => Promise<{ success: boolean }>;
      // Watcher control
      watchFolder: (path: string) => Promise<{ watching: boolean }>;
      unwatchFolder: (path: string) => Promise<{ watching: boolean }>;
      // System
      getDatabasePath: () => Promise<string>;
      pickFolder: () => Promise<string | null>;
    };
  }
}