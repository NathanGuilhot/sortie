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
import { IPC_CHANNELS } from './ipc-channels';

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
  getPersonThumbnails: (personIds: number[]) => Promise<Face[]>;
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

export const IPC_INVOKE_CHANNELS = {
  getImages: IPC_CHANNELS.getImages,
  getImage: IPC_CHANNELS.getImage,
  reshuffleImages: IPC_CHANNELS.reshuffleImages,
  queryImages: IPC_CHANNELS.queryImages,
  getEmbedderStatus: IPC_CHANNELS.getEmbedderStatus,
  findSimilarImages: IPC_CHANNELS.findSimilarImages,
  addFolder: IPC_CHANNELS.addFolder,
  scanFolder: IPC_CHANNELS.scanFolder,
  cancelOperation: IPC_CHANNELS.cancelOperation,
  getFolders: IPC_CHANNELS.getFolders,
  getFoldersWithStats: IPC_CHANNELS.getFoldersWithStats,
  removeFolder: IPC_CHANNELS.removeFolder,
  getAllTags: IPC_CHANNELS.getAllTags,
  getTagsWithCounts: IPC_CHANNELS.getTagsWithCounts,
  updateImageTags: IPC_CHANNELS.updateImageTags,
  hideImage: IPC_CHANNELS.hideImage,
  updateImageMetadata: IPC_CHANNELS.updateImageMetadata,
  getLinkPreview: IPC_CHANNELS.getLinkPreview,
  fetchLinkPreview: IPC_CHANNELS.fetchLinkPreview,
  getSuggestions: IPC_CHANNELS.getSuggestions,
  dismissSuggestion: IPC_CHANNELS.dismissSuggestion,
  boardsList: IPC_CHANNELS.boards.list,
  boardsGet: IPC_CHANNELS.boards.get,
  boardsGetImages: IPC_CHANNELS.boards.getImages,
  boardsGetImageSuggestions: IPC_CHANNELS.boards.getImageSuggestions,
  boardsReorder: IPC_CHANNELS.boards.reorder,
  boardsAddImage: IPC_CHANNELS.boards.addImage,
  boardsRemoveImage: IPC_CHANNELS.boards.removeImage,
  boardsCreate: IPC_CHANNELS.boards.create,
  boardsRename: IPC_CHANNELS.boards.rename,
  boardsSetColor: IPC_CHANNELS.boards.setColor,
  boardsDelete: IPC_CHANNELS.boards.delete,
  getCollections: IPC_CHANNELS.getCollections,
  createCollection: IPC_CHANNELS.createCollection,
  organizeImages: IPC_CHANNELS.organizeImages,
  watchFolder: IPC_CHANNELS.watchFolder,
  unwatchFolder: IPC_CHANNELS.unwatchFolder,
  setFolderFaceScanExclusion: IPC_CHANNELS.setFolderFaceScanExclusion,
  recomputeEmbedding: IPC_CHANNELS.recomputeEmbedding,
  recomputePalette: IPC_CHANNELS.recomputePalette,
  computeMissingPalettes: IPC_CHANNELS.computeMissingPalettes,
  computeMissingHashes: IPC_CHANNELS.computeMissingHashes,
  findDuplicateGroups: IPC_CHANNELS.findDuplicateGroups,
  dismissDuplicatePair: IPC_CHANNELS.dismissDuplicatePair,
  deleteImage: IPC_CHANNELS.deleteImage,
  revealInFinder: IPC_CHANNELS.revealInFinder,
  copyImageToClipboard: IPC_CHANNELS.copyImageToClipboard,
  backfillExif: IPC_CHANNELS.backfillExif,
  getPersons: IPC_CHANNELS.getPersons,
  getPersonImages: IPC_CHANNELS.getPersonImages,
  getPersonThumbnails: IPC_CHANNELS.getPersonThumbnails,
  renamePerson: IPC_CHANNELS.renamePerson,
  mergePersons: IPC_CHANNELS.mergePersons,
  splitFaceFromPerson: IPC_CHANNELS.splitFaceFromPerson,
  getImageFaces: IPC_CHANNELS.getImageFaces,
  setPersonThumbnail: IPC_CHANNELS.setPersonThumbnail,
  processFaces: IPC_CHANNELS.processFaces,
  resetFaceData: IPC_CHANNELS.resetFaceData,
  deletePerson: IPC_CHANNELS.deletePerson,
  resetDatabase: IPC_CHANNELS.resetDatabase,
  getDatabasePath: IPC_CHANNELS.getDatabasePath,
  pickFolder: IPC_CHANNELS.pickFolder,
  settingsGet: IPC_CHANNELS.settings.get,
  settingsSet: IPC_CHANNELS.settings.set,
  suggestDefaultPhotoFolder: IPC_CHANNELS.suggestDefaultPhotoFolder,
  recheckFolderAvailability: IPC_CHANNELS.recheckFolderAvailability,
  appGetVersion: IPC_CHANNELS.app.getVersion,
  appOpenExternal: IPC_CHANNELS.app.openExternal,
  appShowAboutPanel: IPC_CHANNELS.app.showAboutPanel,
  ocrGet: IPC_CHANNELS.ocr.get,
  ocrEnsure: IPC_CHANNELS.ocr.ensure,
  pinterestScrape: IPC_CHANNELS.pinterest.scrape,
  pinterestLoadMore: IPC_CHANNELS.pinterest.loadMore,
  pinterestImportPin: IPC_CHANNELS.pinterest.importPin,
  pinterestStartBulkImport: IPC_CHANNELS.pinterest.startBulkImport,
  pinterestCancelBulkImport: IPC_CHANNELS.pinterest.cancelBulkImport,
  pinterestRevealImportFolder: IPC_CHANNELS.pinterest.revealImportFolder,
  pinterestGetImportFolder: IPC_CHANNELS.pinterest.getImportFolder,
} as const;

export interface InvokeArgsByKey {
  getImages: { limit?: number; offset?: number } | undefined;
  getImage: { id: number };
  reshuffleImages: undefined;
  queryImages: Query;
  getEmbedderStatus: undefined;
  findSimilarImages: { imageId: number; limit?: number };
  addFolder: { path: string };
  scanFolder: { path: string; opId: string };
  cancelOperation: { opId: string };
  getFolders: undefined;
  getFoldersWithStats: undefined;
  removeFolder: { path: string };
  getAllTags: undefined;
  getTagsWithCounts: undefined;
  updateImageTags: { imageId: number; tags: string[] };
  hideImage: { imageId: number };
  updateImageMetadata: { imageId: number; metadata: SortieImageMetadataUpdate };
  getLinkPreview: { url: string };
  fetchLinkPreview: { url: string };
  getSuggestions: { imageId: number };
  dismissSuggestion: { imageId: number; tagId: number };
  boardsList: undefined;
  boardsGet: { tagId: number };
  boardsGetImages: { tagId: number; limit?: number; offset?: number };
  boardsGetImageSuggestions: { tagId: number };
  boardsReorder: { tagId: number; orderedImageIds: number[] };
  boardsAddImage: { imageId: number; tagId: number };
  boardsRemoveImage: { imageId: number; tagId: number };
  boardsCreate: { name: string; color?: string };
  boardsRename: { tagId: number; name: string };
  boardsSetColor: { tagId: number; color: string };
  boardsDelete: { tagId: number };
  getCollections: undefined;
  createCollection: { name: string; description?: string };
  organizeImages: undefined;
  watchFolder: { path: string };
  unwatchFolder: { path: string };
  setFolderFaceScanExclusion: { path: string; excluded: boolean };
  recomputeEmbedding: { imageId: number };
  recomputePalette: { imageId: number };
  computeMissingPalettes: { opId: string };
  computeMissingHashes: { opId: string };
  findDuplicateGroups: undefined;
  dismissDuplicatePair: { imageId1: number; imageId2: number };
  deleteImage: { imageId: number };
  revealInFinder: { filePath: string };
  copyImageToClipboard: { filePath: string };
  backfillExif: { opId: string };
  getPersons: undefined;
  getPersonImages: { personId: number; limit?: number; offset?: number };
  getPersonThumbnails: { personIds: number[] };
  renamePerson: { personId: number; name: string };
  mergePersons: { keepPersonId: number; mergePersonId: number };
  splitFaceFromPerson: { faceId: number };
  getImageFaces: { imageId: number };
  setPersonThumbnail: { personId: number; faceId: number };
  processFaces: { opId: string };
  resetFaceData: undefined;
  deletePerson: { personId: number };
  resetDatabase: undefined;
  getDatabasePath: undefined;
  pickFolder: undefined;
  settingsGet: { key: AppSettingKey };
  settingsSet: { key: AppSettingKey; value: string };
  suggestDefaultPhotoFolder: undefined;
  recheckFolderAvailability: { path?: string } | undefined;
  appGetVersion: undefined;
  appOpenExternal: { url: string };
  appShowAboutPanel: undefined;
  ocrGet: { imageId: number };
  ocrEnsure: { imageId: number };
  pinterestScrape: { input: string; target?: number };
  pinterestLoadMore: { target: PinterestTarget; bookmarks: string[]; desired?: number };
  pinterestImportPin: { pin: PinterestResult };
  pinterestStartBulkImport: {
    username: string;
    slug: string;
    hideAiGenerated: boolean;
  };
  pinterestCancelBulkImport: { jobId: string };
  pinterestRevealImportFolder: undefined;
  pinterestGetImportFolder: undefined;
}

export interface InvokeResultByKey {
  getImages: Image[];
  getImage: Image | null;
  reshuffleImages: { success: boolean };
  queryImages: SearchResult[];
  getEmbedderStatus: EmbedderStatus;
  findSimilarImages: SearchResult[];
  addFolder: { folderId: number; overlap: { parents: string[]; children: string[] } };
  scanFolder: ScanFolderResult;
  cancelOperation: { cancelled: boolean };
  getFolders: Folder[];
  getFoldersWithStats: FolderWithStats[];
  removeFolder: { success: boolean };
  getAllTags: Tag[];
  getTagsWithCounts: TagWithCount[];
  updateImageTags: { success: boolean };
  hideImage: { success: boolean };
  updateImageMetadata: { success: boolean };
  getLinkPreview: LinkPreview | null;
  fetchLinkPreview: LinkPreview;
  getSuggestions: TagSuggestion[];
  dismissSuggestion: { success: boolean };
  boardsList: Board[];
  boardsGet: Board | null;
  boardsGetImages: Image[];
  boardsGetImageSuggestions: Image[];
  boardsReorder: { success: boolean };
  boardsAddImage: { success: boolean };
  boardsRemoveImage: { success: boolean };
  boardsCreate: Board;
  boardsRename: { success: boolean };
  boardsSetColor: { success: boolean };
  boardsDelete: { success: boolean };
  getCollections: Collection[];
  createCollection: { collectionId: number };
  organizeImages: { collectionIds: number[] };
  watchFolder: { watching: boolean };
  unwatchFolder: { watching: boolean };
  setFolderFaceScanExclusion: { changed: boolean };
  recomputeEmbedding: { success: boolean };
  recomputePalette: { success: boolean };
  computeMissingPalettes: { computed: number; cancelled: boolean };
  computeMissingHashes: HashScanResult;
  findDuplicateGroups: DuplicateGroup[];
  dismissDuplicatePair: { success: boolean };
  deleteImage: { success: boolean };
  revealInFinder: { success: boolean };
  copyImageToClipboard: { success: boolean };
  backfillExif: BackfillExifResult;
  getPersons: Person[];
  getPersonImages: Image[];
  getPersonThumbnails: Face[];
  renamePerson: { success: boolean };
  mergePersons: { success: boolean };
  splitFaceFromPerson: { newPersonId: number };
  getImageFaces: Face[];
  setPersonThumbnail: { success: boolean };
  processFaces: FaceScanResult;
  resetFaceData: { success: boolean };
  deletePerson: { success: boolean };
  resetDatabase: { success: boolean };
  getDatabasePath: string;
  pickFolder: string | null;
  settingsGet: string | null;
  settingsSet: { success: boolean };
  suggestDefaultPhotoFolder: SuggestDefaultPhotoFolderResult;
  recheckFolderAvailability: { changes: FolderAvailabilityChange[] };
  appGetVersion: string;
  appOpenExternal: { success: boolean };
  appShowAboutPanel: void;
  ocrGet: OcrResult;
  ocrEnsure: { available: false } | { available: true; state: OcrResult };
  pinterestScrape: PinterestScrapeResponse;
  pinterestLoadMore: PinterestLoadMoreResponse;
  pinterestImportPin: PinterestImportResponse;
  pinterestStartBulkImport: PinterestBulkImportStartResponse;
  pinterestCancelBulkImport: PinterestBulkImportCancelResponse;
  pinterestRevealImportFolder: { success: boolean };
  pinterestGetImportFolder: string;
}

export type InvokeKey = keyof typeof IPC_INVOKE_CHANNELS;
