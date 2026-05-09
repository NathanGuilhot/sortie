import {
  DatabaseManager,
  ClipEmbedder,
  SuggestionEngine,
  FaceDetector,
  FaceMatcher,
  FaceScanService,
} from 'pipeline';
import {
  Image,
  Tag,
  Board,
  Face,
  Person,
  Folder,
  FolderWithStats,
  Query,
  SearchResult,
  DuplicateGroup,
  FaceScanProgress,
  FaceScanResult,
  ScanFolderResult,
  HashScanResult,
  BackfillExifResult,
  EmbedderStatus,
  LinkPreview,
  type AppSettingKey,
  OcrResult,
  OcrUpdatePayload,
  TagSuggestion,
  OcrBlock,
} from 'shared';
import { DatabaseOcrService } from './database-ocr';
import { DatabaseBoardsService } from './database/boards';
import { DatabaseFoldersService } from './database/folders';
import { DatabaseImagesService } from './database/images';
import { DatabaseMaintenanceService } from './database/maintenance';
import { DatabasePeopleService } from './database/people';
import { DatabaseSearchService } from './database/search';

export class DatabaseService {
  private db: DatabaseManager | null = null;
  private embedder: ClipEmbedder | null = null;
  private suggestionEngine: SuggestionEngine | null = null;
  private faceDetector: FaceDetector | null = null;
  private faceMatcher: FaceMatcher | null = null;
  private faceScan: FaceScanService | null = null;
  private embedderStatus: EmbedderStatus = { state: 'idle' };
  private embedderStatusListeners = new Set<(status: EmbedderStatus) => void>();
  private ocr: DatabaseOcrService | null = null;
  readonly images = new DatabaseImagesService({
    requireDb: () => this.requireDb(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    getFaceScan: () => {
      if (!this.faceScan) {
        throw new Error(
          'Face detection is not available. The face-api models may have failed to load.',
        );
      }
      return this.faceScan;
    },
    getFolderForPath: (filePath) => this.getFolderForPath(filePath),
  });
  readonly search = new DatabaseSearchService({
    requireDb: () => this.requireDb(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    getOrBuildShuffledIds: (cacheKey, loadIds) =>
      this.images.getOrBuildShuffledIds(cacheKey, loadIds),
    fetchImagesByIdsInOrder: (ids) => this.images.fetchImagesByIdsInOrder(ids),
  });
  readonly boards = new DatabaseBoardsService({
    requireDb: () => this.requireDb(),
    fetchImagesByIdsInOrder: (ids) => this.images.fetchImagesByIdsInOrder(ids),
    invalidateMetadataCaches: () => this.images.invalidateMetadataCaches(),
    getSuggestionEngine: () => {
      if (!this.suggestionEngine) throw new Error('SuggestionEngine not initialized');
      return this.suggestionEngine;
    },
  });
  readonly folders = new DatabaseFoldersService({
    requireDb: () => this.requireDb(),
    addImage: (filePath, options) => this.images.addImage(filePath, options),
    invalidateImageCache: () => this.images.invalidateImageCache(),
  });
  readonly people = new DatabasePeopleService({
    requireDb: () => this.requireDb(),
    getOrBuildShuffledIds: (cacheKey, loadIds) =>
      this.images.getOrBuildShuffledIds(cacheKey, loadIds),
    fetchImagesByIdsInOrder: (ids) => this.images.fetchImagesByIdsInOrder(ids),
    deleteShuffledIds: (prefixOrKey, exact = false) =>
      this.images.deleteShuffledIds(prefixOrKey, exact),
    getFaceMatcher: () => {
      if (!this.faceMatcher) throw new Error('FaceMatcher not initialized');
      return this.faceMatcher;
    },
    getFaceScan: () => {
      if (!this.faceScan) {
        throw new Error(
          'Face detection is not available. The face-api models may have failed to load.',
        );
      }
      return this.faceScan;
    },
  });
  readonly maintenance = new DatabaseMaintenanceService({
    requireDb: () => this.requireDb(),
    invalidateImageCache: () => this.images.invalidateImageCache(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    createFileDeletionError: (filePath, code, cause) =>
      new FileDeletionError(filePath, code, cause),
  });

  initialize(
    dbPath: string,
    faceModelsPath: string,
    faceCacheDir?: string,
    clipCacheDir?: string,
    ocrModelsPath?: string,
  ) {
    this.db = new DatabaseManager(dbPath);
    this.embedder = new ClipEmbedder(clipCacheDir);
    this.suggestionEngine = new SuggestionEngine(this.db);
    this.faceDetector = new FaceDetector(faceModelsPath, faceCacheDir);
    this.faceMatcher = new FaceMatcher(this.db);
    this.faceScan = new FaceScanService(
      this.db,
      this.faceDetector,
      this.faceMatcher,
      this.embedder,
    );
    this.ocr = new DatabaseOcrService(this.db, ocrModelsPath);
  }

  async runStartupMaintenance(): Promise<void> {
    if (!this.db) return;
    const result = await this.db.runStartupMaintenance();
    if (result.fixedImageDimensions > 0) {
      this.images.invalidateImageCache();
      console.log(`[migration] fixed dimensions for ${result.fixedImageDimensions} images`);
    }
  }

  async warmupEmbedder(): Promise<void> {
    if (!this.embedder) return;
    if (this.embedderStatus.state === 'ready' || this.embedderStatus.state === 'warming') return;
    this.setEmbedderStatus({ state: 'warming' });
    try {
      await this.embedder.initialize();
      this.setEmbedderStatus({ state: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('CLIP warmup failed:', error);
      this.setEmbedderStatus({ state: 'error', message });
    }
  }

  getEmbedderStatus(): EmbedderStatus {
    return this.embedderStatus;
  }

  onEmbedderStatus(listener: (status: EmbedderStatus) => void): () => void {
    this.embedderStatusListeners.add(listener);
    return () => {
      this.embedderStatusListeners.delete(listener);
    };
  }

  isOcrAvailable(): boolean {
    return this.ocr?.isAvailable() ?? false;
  }

  getOcr(imageId: number): OcrResult {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.ocr) throw new Error('OCR service not initialized');
    return this.ocr.get(imageId);
  }

  ensureOcr(imageId: number): Promise<OcrBlock[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.ocr) throw new Error('OCR service not initialized');
    return this.ocr.ensure(imageId);
  }

  onOcrUpdate(listener: (payload: OcrUpdatePayload) => void): () => void {
    if (!this.ocr) throw new Error('OCR service not initialized');
    return this.ocr.onUpdate(listener);
  }

  private setEmbedderStatus(status: EmbedderStatus) {
    this.embedderStatus = status;
    for (const listener of this.embedderStatusListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Embedder status listener failed:', error);
      }
    }
  }

  close() {
    this.db?.close();
    this.suggestionEngine?.close();
  }

  private requireDb(): DatabaseManager {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    return this.images.getImages(limit, offset);
  }

  async getImage(id: number): Promise<Image | null> {
    return this.images.getImage(id);
  }

  reshuffle(): void {
    this.images.reshuffle();
  }

  async queryImages(q: Query): Promise<SearchResult[]> {
    return this.search.queryImages(q);
  }

  async findSimilarImages(imageId: number, limit: number = 20): Promise<SearchResult[]> {
    return this.search.findSimilarImages(imageId, limit);
  }

  async addFolder(folderPath: string): Promise<number> {
    return this.folders.addFolder(folderPath);
  }

  async findOverlappingFolders(
    folderPath: string,
  ): Promise<{ parents: string[]; children: string[] }> {
    return this.folders.findOverlappingFolders(folderPath);
  }

  async scanFolder(
    folderPath: string,
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<ScanFolderResult> {
    return this.folders.scanFolder(folderPath, onProgress, signal);
  }

  async getFolders(): Promise<Folder[]> {
    return this.folders.getFolders();
  }

  async getFoldersWithStats(): Promise<FolderWithStats[]> {
    return this.folders.getFoldersWithStats();
  }

  async removeFolder(folderPath: string): Promise<void> {
    return this.folders.removeFolder(folderPath);
  }

  async resetFaceData(): Promise<void> {
    return this.maintenance.resetFaceData();
  }

  async resetDatabase(): Promise<void> {
    return this.maintenance.resetDatabase();
  }

  async updateImageTags(imageId: number, tagNames: string[]): Promise<void> {
    return this.images.updateImageTags(imageId, tagNames);
  }

  async getBoards(): Promise<Board[]> {
    return this.boards.getBoards();
  }

  async getBoard(tagId: number): Promise<Board | null> {
    return this.boards.getBoard(tagId);
  }

  async getBoardImages(tagId: number, limit: number = 100, offset: number = 0): Promise<Image[]> {
    return this.boards.getBoardImages(tagId, limit, offset);
  }

  async reorderBoardImages(tagId: number, orderedImageIds: number[]): Promise<void> {
    return this.boards.reorderBoardImages(tagId, orderedImageIds);
  }

  async addImageToBoard(imageId: number, tagId: number): Promise<void> {
    return this.boards.addImageToBoard(imageId, tagId);
  }

  async addImagesToBoard(imageIds: number[], tagId: number): Promise<void> {
    return this.boards.addImagesToBoard(imageIds, tagId);
  }

  async removeImageFromBoard(imageId: number, tagId: number): Promise<void> {
    return this.boards.removeImageFromBoard(imageId, tagId);
  }

  async createBoard(name: string, color?: string): Promise<Board> {
    return this.boards.createBoard(name, color);
  }

  async renameBoard(tagId: number, name: string): Promise<void> {
    return this.boards.renameBoard(tagId, name);
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    return this.boards.setBoardColor(tagId, color);
  }

  async deleteBoard(tagId: number): Promise<void> {
    return this.boards.deleteBoard(tagId);
  }

  async hideImage(imageId: number): Promise<void> {
    return this.images.hideImage(imageId);
  }

  async markImageMissing(filePath: string): Promise<void> {
    return this.folders.markImageMissing(filePath);
  }

  getFolderForPath(filePath: string): Folder | null {
    if (!this.db) return null;
    return this.folders.getFolderForPath(filePath);
  }

  async setFolderAvailability(
    folderPath: string,
    available: boolean,
    writable: boolean,
  ): Promise<{ changed: boolean }> {
    return this.folders.setFolderAvailability(folderPath, available, writable);
  }

  async setFolderFaceScanExclusion(
    folderPath: string,
    excluded: boolean,
  ): Promise<{ changed: boolean }> {
    return this.folders.setFolderFaceScanExclusion(folderPath, excluded);
  }

  async updateImageMetadata(
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
      website_link?: string | null;
    },
  ): Promise<void> {
    return this.images.updateImageMetadata(imageId, metadata);
  }

  async getLinkPreview(url: string): Promise<LinkPreview | null> {
    return this.images.getLinkPreview(url);
  }

  async fetchAndCacheLinkPreview(url: string): Promise<LinkPreview> {
    return this.images.fetchAndCacheLinkPreview(url);
  }

  async getAllTags(): Promise<Tag[]> {
    return this.images.getAllTags();
  }

  async getTagsWithCounts(): Promise<Array<Tag & { usage_count: number }>> {
    return this.images.getTagsWithCounts();
  }

  async getSuggestions(imageId: number): Promise<TagSuggestion[]> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    return this.suggestionEngine.generateSuggestionsForImage(imageId);
  }

  async dismissSuggestion(imageId: number, tagId: number): Promise<void> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    this.suggestionEngine.dismissSuggestion(imageId, tagId);
  }

  async getBoardImageSuggestions(tagId: number): Promise<Image[]> {
    return this.boards.getBoardImageSuggestions(tagId);
  }

  async backfillExifData(signal?: AbortSignal): Promise<BackfillExifResult> {
    return this.maintenance.backfillExifData(signal);
  }

  // --- Face Detection / People ---

  async processExistingImagesForFaces(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<FaceScanResult> {
    return this.people.processExistingImagesForFaces(onProgress, signal);
  }

  async getPersons(): Promise<Person[]> {
    return this.people.getPersons();
  }

  async getPersonImages(
    personId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    return this.people.getPersonImages(personId, limit, offset);
  }

  async getPersonThumbnails(personIds: number[]): Promise<Face[]> {
    return this.people.getPersonThumbnails(personIds);
  }

  async renamePerson(personId: number, name: string): Promise<void> {
    return this.people.renamePerson(personId, name);
  }

  async mergePersons(keepPersonId: number, mergePersonId: number): Promise<void> {
    return this.people.mergePersons(keepPersonId, mergePersonId);
  }

  async splitFaceFromPerson(faceId: number): Promise<number> {
    return this.people.splitFaceFromPerson(faceId);
  }

  async getImageFaces(imageId: number): Promise<Face[]> {
    return this.people.getImageFaces(imageId);
  }

  async setPersonThumbnail(personId: number, faceId: number): Promise<void> {
    return this.people.setPersonThumbnail(personId, faceId);
  }

  async deletePerson(personId: number): Promise<void> {
    return this.people.deletePerson(personId);
  }

  getDatabase(): DatabaseManager | null {
    return this.db;
  }

  getSetting(key: AppSettingKey): string | null {
    return this.requireDb().getSetting(key);
  }

  setSetting(key: AppSettingKey, value: string): void {
    this.requireDb().setSetting(key, value);
  }

  async addImage(filePath: string): Promise<number> {
    const result = await this.images.addImage(filePath);
    return result.imageId;
  }

  async recomputeEmbedding(imageId: number): Promise<void> {
    return this.maintenance.recomputeEmbedding(imageId);
  }

  async recomputePalette(imageId: number): Promise<void> {
    return this.maintenance.recomputePalette(imageId);
  }

  async computeMissingPalettes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<{ computed: number; cancelled: boolean }> {
    return this.maintenance.computeMissingPalettes(onProgress, signal);
  }

  async computeMissingHashes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<HashScanResult> {
    return this.maintenance.computeMissingHashes(onProgress, signal);
  }

  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    return this.maintenance.findDuplicateGroups();
  }

  async dismissDuplicatePair(imageId1: number, imageId2: number): Promise<void> {
    return this.maintenance.dismissDuplicatePair(imageId1, imageId2);
  }

  async deleteImage(imageId: number): Promise<void> {
    return this.maintenance.deleteImage(imageId);
  }
}

export class FileDeletionError extends Error {
  readonly filePath: string;
  readonly code: string | undefined;

  constructor(filePath: string, code: string | undefined, cause: Error) {
    super(`[${code ?? 'EUNKNOWN'}] ${describeFsErrorCode(code)}: ${filePath}`);
    this.name = 'FileDeletionError';
    this.filePath = filePath;
    this.code = code;
    (this as unknown as { cause?: unknown }).cause = cause;
  }
}

function describeFsErrorCode(code: string | undefined): string {
  switch (code) {
    case 'EROFS':
      return 'volume is read-only';
    case 'EACCES':
    case 'EPERM':
      return 'permission denied';
    case 'EBUSY':
      return 'file is in use';
    case 'ENOTEMPTY':
      return 'directory not empty';
    default:
      return 'could not delete file';
  }
}
