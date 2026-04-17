import { TagSuggestion, Collection } from 'pipeline';
import {
  Image,
  SearchResult,
  Folder,
  FolderWithStats,
  DuplicateGroup,
  Person,
  Face,
  FaceScanProgress,
  FaceScanResult,
  ScanFolderResult,
  HashScanResult,
  BackfillExifResult,
  EmbedderStatus,
} from 'shared';

export {};

declare global {
  interface Window {
    sortieAPI: {
      // Image operations
      getImages: (limit?: number, offset?: number) => Promise<Image[]>;
      searchImages: (query: string, limit?: number) => Promise<SearchResult[]>;
      getEmbedderStatus: () => Promise<EmbedderStatus>;
      onEmbedderStatus: (callback: (status: EmbedderStatus) => void) => () => void;
      findSimilarImages: (imageId: number, limit?: number) => Promise<SearchResult[]>;
      getFavoriteImages: (limit?: number, offset?: number) => Promise<Image[]>;
      filterImages: (tags: string[], limit?: number, offset?: number) => Promise<Image[]>;
      addFolder: (path: string) => Promise<number>;
      scanFolder: (path: string, opId: string) => Promise<ScanFolderResult>;
      cancelOperation: (opId: string) => Promise<{ cancelled: boolean }>;
      getFolders: () => Promise<Folder[]>;
      getFoldersWithStats: () => Promise<FolderWithStats[]>;
      removeFolder: (path: string) => Promise<{ success: boolean }>;
      getAllTags: () => Promise<
        Array<{
          id: number;
          name: string;
          category: string | null;
          color: string;
          created_at: string;
        }>
      >;
      getTagsWithCounts: () => Promise<
        Array<{
          id: number;
          name: string;
          category: string | null;
          color: string;
          created_at: string;
          usage_count: number;
        }>
      >;
      updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
      hideImage: (imageId: number) => Promise<void>;
      updateImageMetadata: (
        imageId: number,
        metadata: {
          description?: string;
          favorite?: boolean;
          captured_at?: string | null;
          city?: string | null;
          country?: string | null;
        },
      ) => Promise<void>;
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
      // Cleanup / Duplicate detection
      computeMissingHashes: (opId: string) => Promise<HashScanResult>;
      findDuplicateGroups: () => Promise<DuplicateGroup[]>;
      dismissDuplicatePair: (imageId1: number, imageId2: number) => Promise<{ success: boolean }>;
      deleteImage: (imageId: number) => Promise<{ success: boolean }>;
      onHashProgress: (
        callback: (progress: { current: number; total: number; currentFile: string }) => void,
      ) => () => void;
      onScanProgress: (
        callback: (progress: { current: number; total: number; currentFile: string }) => void,
      ) => () => void;
      // File actions
      revealInFinder: (filePath: string) => Promise<{ success: boolean }>;
      backfillExif: (opId: string) => Promise<BackfillExifResult>;
      // Face Detection / People
      getPersons: () => Promise<Person[]>;
      getPersonImages: (
        personId: number,
        limit?: number,
        offset?: number,
      ) => Promise<Image[]>;
      renamePerson: (personId: number, name: string) => Promise<{ success: boolean }>;
      mergePersons: (
        keepPersonId: number,
        mergePersonId: number,
      ) => Promise<{ success: boolean }>;
      splitFaceFromPerson: (faceId: number) => Promise<{ newPersonId: number }>;
      getImageFaces: (imageId: number) => Promise<Face[]>;
      setPersonThumbnail: (
        personId: number,
        faceId: number,
      ) => Promise<{ success: boolean }>;
      processFaces: (opId: string) => Promise<FaceScanResult>;
      resetFaceData: () => Promise<{ success: boolean }>;
      filterImagesByPerson: (
        personId: number,
        limit?: number,
        offset?: number,
      ) => Promise<Image[]>;
      deletePerson: (personId: number) => Promise<{ success: boolean }>;
      onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) => () => void;
      // System
      resetDatabase: () => Promise<{ success: boolean }>;
      getDatabasePath: () => Promise<string>;
      pickFolder: () => Promise<string | null>;
    };
  }
}
