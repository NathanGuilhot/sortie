import type {
  AppSettingKey,
  BackfillExifResult,
  Board,
  Collection,
  DuplicateGroup,
  EmbedderStatus,
  Face,
  FaceScanProgress,
  FaceScanResult,
  Folder,
  FolderWithStats,
  HashScanResult,
  Image,
  LinkPreview,
  OcrResult,
  OcrUpdatePayload,
  Person,
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestImportResult,
  PinterestResult,
  PinterestSearchPage,
  Query,
  ScanFolderResult,
  SearchResult,
  Tag,
  TagSuggestion,
  TagWithCount,
} from './types';

export interface SortieProgress {
  current: number;
  total: number;
  currentFile: string;
}

export interface FolderAvailabilityChange {
  path: string;
  available: boolean;
  writable: boolean;
}

export interface SuggestDefaultPhotoFolderResult {
  path: string;
  exists: boolean;
  approxImageCount: number | null;
  capped: boolean;
}

export interface SortieImageMetadataUpdate {
  description?: string;
  favorite?: boolean;
  captured_at?: string | null;
  city?: string | null;
  country?: string | null;
  website_link?: string | null;
}

export type PinterestTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

export type PinterestScrapeResponse =
  | { ok: true; target: PinterestTarget; page: PinterestSearchPage }
  | { ok: false; message: string };

export type PinterestLoadMoreResponse =
  | { ok: true; page: PinterestSearchPage }
  | { ok: false; message: string };

export type PinterestImportResponse =
  | { ok: true; result: PinterestImportResult }
  | { ok: false; message: string };

export type PinterestBulkImportStartResponse =
  | { ok: true; jobId: string }
  | { ok: false; message: string };

export type PinterestBulkImportCancelResponse =
  | { ok: true }
  | { ok: false; message: string };

export interface SortieAPI {
  getImages: (limit?: number, offset?: number) => Promise<Image[]>;
  getImage: (id: number) => Promise<Image | null>;
  reshuffleImages: () => Promise<{ success: boolean }>;
  query: (query: Query) => Promise<SearchResult[]>;
  getEmbedderStatus: () => Promise<EmbedderStatus>;
  onEmbedderStatus: (callback: (status: EmbedderStatus) => void) => () => void;
  findSimilarImages: (imageId: number, limit?: number) => Promise<SearchResult[]>;
  addFolder: (path: string) => Promise<{
    folderId: number;
    overlap: { parents: string[]; children: string[] };
  }>;
  scanFolder: (path: string, opId: string) => Promise<ScanFolderResult>;
  cancelOperation: (opId: string) => Promise<{ cancelled: boolean }>;
  getFolders: () => Promise<Folder[]>;
  getFoldersWithStats: () => Promise<FolderWithStats[]>;
  removeFolder: (path: string) => Promise<{ success: boolean }>;
  getAllTags: () => Promise<Tag[]>;
  getTagsWithCounts: () => Promise<TagWithCount[]>;
  updateImageTags: (imageId: number, tags: string[]) => Promise<{ success: boolean }>;
  hideImage: (imageId: number) => Promise<{ success: boolean }>;
  updateImageMetadata: (
    imageId: number,
    metadata: SortieImageMetadataUpdate,
  ) => Promise<{ success: boolean }>;
  getLinkPreview: (url: string) => Promise<LinkPreview | null>;
  fetchLinkPreview: (url: string) => Promise<LinkPreview>;
  getSuggestions: (imageId: number) => Promise<TagSuggestion[]>;
  dismissSuggestion: (imageId: number, tagId: number) => Promise<{ success: boolean }>;
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
  getCollections: () => Promise<Collection[]>;
  createCollection: (name: string, description?: string) => Promise<number>;
  organizeImages: () => Promise<number[]>;
  watchFolder: (path: string) => Promise<{ watching: boolean }>;
  unwatchFolder: (path: string) => Promise<{ watching: boolean }>;
  setFolderFaceScanExclusion: (
    path: string,
    excluded: boolean,
  ) => Promise<{ changed: boolean }>;
  recomputeEmbedding: (imageId: number) => Promise<{ success: boolean }>;
  recomputePalette: (imageId: number) => Promise<{ success: boolean }>;
  computeMissingPalettes: (opId: string) => Promise<{ computed: number; cancelled: boolean }>;
  onPaletteProgress: (callback: (progress: SortieProgress) => void) => () => void;
  computeMissingHashes: (opId: string) => Promise<HashScanResult>;
  findDuplicateGroups: () => Promise<DuplicateGroup[]>;
  dismissDuplicatePair: (imageId1: number, imageId2: number) => Promise<{ success: boolean }>;
  deleteImage: (imageId: number) => Promise<{ success: boolean }>;
  onHashProgress: (callback: (progress: SortieProgress) => void) => () => void;
  onScanProgress: (callback: (progress: SortieProgress) => void) => () => void;
  revealInFinder: (filePath: string) => Promise<{ success: boolean }>;
  copyImageToClipboard: (filePath: string) => Promise<{ success: boolean }>;
  backfillExif: (opId: string) => Promise<BackfillExifResult>;
  getPersons: () => Promise<Person[]>;
  getPersonImages: (personId: number, limit?: number, offset?: number) => Promise<Image[]>;
  renamePerson: (personId: number, name: string) => Promise<{ success: boolean }>;
  mergePersons: (
    keepPersonId: number,
    mergePersonId: number,
  ) => Promise<{ success: boolean }>;
  splitFaceFromPerson: (faceId: number) => Promise<{ newPersonId: number }>;
  getImageFaces: (imageId: number) => Promise<Face[]>;
  setPersonThumbnail: (personId: number, faceId: number) => Promise<{ success: boolean }>;
  processFaces: (opId: string) => Promise<FaceScanResult>;
  resetFaceData: () => Promise<{ success: boolean }>;
  deletePerson: (personId: number) => Promise<{ success: boolean }>;
  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) => () => void;
  resetDatabase: () => Promise<{ success: boolean }>;
  getDatabasePath: () => Promise<string>;
  pickFolder: () => Promise<string | null>;
  settings: {
    get: (key: AppSettingKey) => Promise<string | null>;
    set: (key: AppSettingKey, value: string) => Promise<{ success: boolean }>;
  };
  suggestDefaultPhotoFolder: () => Promise<SuggestDefaultPhotoFolderResult>;
  recheckFolderAvailability: (folderPath?: string) => Promise<{ changes: FolderAvailabilityChange[] }>;
  onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) => () => void;
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<{ success: boolean }>;
    showAboutPanel: () => Promise<void>;
    onShowAbout: (callback: () => void) => () => void;
  };
  ocr: {
    get: (imageId: number) => Promise<OcrResult>;
    ensure: (imageId: number) => Promise<{ available: false } | { available: true; state: OcrResult }>;
    onUpdated: (callback: (payload: OcrUpdatePayload) => void) => () => void;
  };
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
    onBulkImportProgress: (callback: (progress: PinterestBulkImportProgress) => void) => () => void;
    onBulkImportComplete: (callback: (summary: PinterestBulkImportSummary) => void) => () => void;
    revealImportFolder: () => Promise<{ success: boolean }>;
    getImportFolder: () => Promise<string>;
  };
}
