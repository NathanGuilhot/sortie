import { TagSuggestion, Collection } from 'pipeline';
import {
  Image,
  Board,
  SearchResult,
  Query,
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
  LinkPreview,
  PinterestResult,
  PinterestSearchPage,
  PinterestImportResult,
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  OcrResult,
  OcrUpdatePayload,
} from 'shared';

type PinterestTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

type PinterestScrapeResponse =
  | { ok: true; target: PinterestTarget; page: PinterestSearchPage }
  | { ok: false; message: string };

type PinterestLoadMoreResponse =
  | { ok: true; page: PinterestSearchPage }
  | { ok: false; message: string };

type PinterestImportResponse =
  | { ok: true; result: PinterestImportResult }
  | { ok: false; message: string };

type PinterestBulkImportStartResponse =
  | { ok: true; jobId: string }
  | { ok: false; message: string };

type PinterestBulkImportCancelResponse = { ok: true } | { ok: false; message: string };

export {};

declare global {
  interface Window {
    sortieAPI: {
      // Image operations
      getImages: (limit?: number, offset?: number) => Promise<Image[]>;
      getImage: (id: number) => Promise<Image | null>;
      reshuffleImages: () => Promise<{ success: boolean }>;
      query: (query: Query) => Promise<SearchResult[]>;
      getEmbedderStatus: () => Promise<EmbedderStatus>;
      onEmbedderStatus: (callback: (status: EmbedderStatus) => void) => () => void;
      findSimilarImages: (imageId: number, limit?: number) => Promise<SearchResult[]>;
      addFolder: (
        path: string,
      ) => Promise<{
        folderId: number;
        overlap: { parents: string[]; children: string[] };
      }>;
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
          website_link?: string | null;
        },
      ) => Promise<void>;
      getLinkPreview: (url: string) => Promise<LinkPreview | null>;
      fetchLinkPreview: (url: string) => Promise<LinkPreview>;
      // Suggestions
      getSuggestions: (imageId: number) => Promise<TagSuggestion[]>;
      dismissSuggestion: (imageId: number, tagId: number) => Promise<void>;
      // Boards
      boards: {
        list: () => Promise<Board[]>;
        get: (tagId: number) => Promise<Board | null>;
        getImages: (tagId: number, limit?: number, offset?: number) => Promise<Image[]>;
        getImageSuggestions: (tagId: number) => Promise<Image[]>;
        reorder: (tagId: number, orderedImageIds: number[]) => Promise<{ success: boolean }>;
        addImage: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
        removeImage: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
        create: (name: string, color?: string) => Promise<Board>;
        rename: (tagId: number, name: string) => Promise<{ success: boolean }>;
        setColor: (tagId: number, color: string) => Promise<{ success: boolean }>;
        delete: (tagId: number) => Promise<{ success: boolean }>;
      };
      // Collections
      getCollections: () => Promise<Collection[]>;
      createCollection: (name: string, description?: string) => Promise<number>;
      organizeImages: () => Promise<number[]>;
      // Embedding
      recomputeEmbedding: (imageId: number) => Promise<{ success: boolean }>;
      // Palette
      recomputePalette: (imageId: number) => Promise<{ success: boolean }>;
      computeMissingPalettes: (opId: string) => Promise<{ computed: number; cancelled: boolean }>;
      onPaletteProgress: (
        callback: (progress: { current: number; total: number; currentFile: string }) => void,
      ) => () => void;
      // Watcher control
      watchFolder: (path: string) => Promise<{ watching: boolean }>;
      unwatchFolder: (path: string) => Promise<{ watching: boolean }>;
      setFolderFaceScanExclusion: (
        path: string,
        excluded: boolean,
      ) => Promise<{ changed: boolean }>;
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
      copyImageToClipboard: (filePath: string) => Promise<{ success: boolean }>;
      backfillExif: (opId: string) => Promise<BackfillExifResult>;
      // Face Detection / People
      getPersons: () => Promise<Person[]>;
      getPersonImages: (personId: number, limit?: number, offset?: number) => Promise<Image[]>;
      renamePerson: (personId: number, name: string) => Promise<{ success: boolean }>;
      mergePersons: (keepPersonId: number, mergePersonId: number) => Promise<{ success: boolean }>;
      splitFaceFromPerson: (faceId: number) => Promise<{ newPersonId: number }>;
      getImageFaces: (imageId: number) => Promise<Face[]>;
      setPersonThumbnail: (personId: number, faceId: number) => Promise<{ success: boolean }>;
      processFaces: (opId: string) => Promise<FaceScanResult>;
      resetFaceData: () => Promise<{ success: boolean }>;
      deletePerson: (personId: number) => Promise<{ success: boolean }>;
      onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) => () => void;
      // System
      resetDatabase: () => Promise<{ success: boolean }>;
      getDatabasePath: () => Promise<string>;
      pickFolder: () => Promise<string | null>;
      // App settings (key-value, persisted in sortie.db)
      settings: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<{ success: boolean }>;
      };
      suggestDefaultPhotoFolder: () => Promise<{
        path: string;
        exists: boolean;
        approxImageCount: number | null;
        capped: boolean;
      }>;
      // Folder availability (external drives)
      recheckFolderAvailability: (folderPath?: string) => Promise<{
        changes: Array<{ path: string; available: boolean; writable: boolean }>;
      }>;
      onFolderAvailability: (
        callback: (change: { path: string; available: boolean; writable: boolean }) => void,
      ) => () => void;
      // App info
      app: {
        getVersion: () => Promise<string>;
        openExternal: (url: string) => Promise<{ success: boolean }>;
        showAboutPanel: () => Promise<void>;
        onShowAbout: (callback: () => void) => () => void;
      };
      // OCR
      ocr: {
        get: (imageId: number) => Promise<OcrResult>;
        ensure: (
          imageId: number,
        ) => Promise<{ available: false } | { available: true; state: OcrResult }>;
        onUpdated: (cb: (payload: OcrUpdatePayload) => void) => () => void;
      };
      // Pinterest import
      pinterest: {
        scrape: (input: string, target?: number) => Promise<PinterestScrapeResponse>;
        loadMore: (
          target: PinterestTarget,
          bookmarks: string[],
          desired?: number,
        ) => Promise<PinterestLoadMoreResponse>;
        importPin: (pin: PinterestResult) => Promise<PinterestImportResponse>;
        startBulkImport: (args: {
          username: string;
          slug: string;
          hideAiGenerated: boolean;
        }) => Promise<PinterestBulkImportStartResponse>;
        cancelBulkImport: (jobId: string) => Promise<PinterestBulkImportCancelResponse>;
        onBulkImportProgress: (cb: (progress: PinterestBulkImportProgress) => void) => () => void;
        onBulkImportComplete: (cb: (summary: PinterestBulkImportSummary) => void) => () => void;
        revealImportFolder: () => Promise<{ success: boolean }>;
        getImportFolder: () => Promise<string>;
      };
    };
  }
}
