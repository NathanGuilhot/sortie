import {
  DatabaseManager,
  ClipEmbedder,
  SuggestionEngine,
  extractExif,
  computeFileHash,
  extractPalette,
  hexToOklab,
  FaceDetector,
  FaceMatcher,
  FaceScanService,
  loadImageInput,
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
import { fetchLinkPreview, hashUrl } from './linkPreview';
import {
  OVERLAP_EXCLUDE_CLAUSE,
  OVERLAP_EXCLUDE_AVAILABLE_CLAUSE,
} from './folder-overlap-sql';
import {
  hydratePalette,
  IMAGE_EXTENSIONS,
  MIME_TYPES,
  type ImageDbRow,
} from './database-helpers';
import { DatabaseOcrService } from './database-ocr';
import { DatabaseBoardsService } from './database/boards';
import { DatabaseFoldersService } from './database/folders';
import { DatabaseMaintenanceService } from './database/maintenance';
import { DatabasePeopleService } from './database/people';
import path from 'path';
import fs from 'fs/promises';

type SqlBinding = string | number | bigint | Uint8Array | null;

export class DatabaseService {
  private db: DatabaseManager | null = null;
  private embedder: ClipEmbedder | null = null;
  private suggestionEngine: SuggestionEngine | null = null;
  private faceDetector: FaceDetector | null = null;
  private faceMatcher: FaceMatcher | null = null;
  private faceScan: FaceScanService | null = null;
  private imageCache = new Map<string, Image[]>();
  // Per-view shuffled ID lists. Built lazily on first request and reused for
  // pagination so LIMIT/OFFSET pages stay stable within a session. A new
  // DatabaseService is created per app launch, so each launch gets a fresh
  // shuffle — this is the "new discovery every time you open the app" behavior.
  // Keys: 'default', 'favorites', 'tags:<sorted,csv>', 'person:<id>'.
  private shuffledIdCache = new Map<string, number[]>();
  private embedderStatus: EmbedderStatus = { state: 'idle' };
  private embedderStatusListeners = new Set<(status: EmbedderStatus) => void>();
  private ocr: DatabaseOcrService | null = null;
  readonly boards = new DatabaseBoardsService({
    requireDb: () => this.requireDb(),
    fetchImagesByIdsInOrder: (ids) => this.fetchImagesByIdsInOrder(ids),
    invalidateMetadataCaches: () => this.invalidateMetadataCaches(),
    getSuggestionEngine: () => {
      if (!this.suggestionEngine) throw new Error('SuggestionEngine not initialized');
      return this.suggestionEngine;
    },
  });
  readonly folders = new DatabaseFoldersService({
    requireDb: () => this.requireDb(),
    addImage: (filePath) => this.addImage(filePath),
    invalidateImageCache: () => this.invalidateImageCache(),
  });
  readonly people = new DatabasePeopleService({
    requireDb: () => this.requireDb(),
    getOrBuildShuffledIds: (cacheKey, loadIds) => this.getOrBuildShuffledIds(cacheKey, loadIds),
    fetchImagesByIdsInOrder: (ids) => this.fetchImagesByIdsInOrder(ids),
    deleteShuffledIds: (prefixOrKey, exact = false) => {
      if (exact) {
        this.shuffledIdCache.delete(prefixOrKey);
        return;
      }
      for (const key of Array.from(this.shuffledIdCache.keys())) {
        if (key.startsWith(prefixOrKey)) {
          this.shuffledIdCache.delete(key);
        }
      }
    },
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
    invalidateImageCache: () => this.invalidateImageCache(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    createFileDeletionError: (filePath, code, cause) => new FileDeletionError(filePath, code, cause),
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
    this.faceScan = new FaceScanService(this.db, this.faceDetector, this.faceMatcher);
    this.ocr = new DatabaseOcrService(this.db, ocrModelsPath);
  }

  async runStartupMaintenance(): Promise<void> {
    if (!this.db) return;
    const result = await this.db.runStartupMaintenance();
    if (result.fixedImageDimensions > 0) {
      this.invalidateImageCache();
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

  // Fisher-Yates shuffle in place.
  private shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[] {
    const cached = this.shuffledIdCache.get(cacheKey);
    if (cached) return cached;
    const ids = loadIds();
    this.shuffleInPlace(ids);
    this.shuffledIdCache.set(cacheKey, ids);
    return ids;
  }

  private queryIds(idQuery: string, params: SqlBinding[] = []): number[] {
    const stmt = this.requireDb().getDatabase().prepare(idQuery);
    const rows = stmt.all(...params) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  private fetchImagesByIdsInOrder(ids: number[]): Image[] {
    return this.requireDb().getImagesByIds(ids);
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    const db = this.requireDb();
    const cacheKey = `images:${limit}:${offset}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const allIds = this.getOrBuildShuffledIds(
      'default',
      () => db.getVisibleImageIds(),
    );
    const pageIds = allIds.slice(offset, offset + limit);
    const images = this.fetchImagesByIdsInOrder(pageIds);
    this.imageCache.set(cacheKey, images);
    return images;
  }

  async getImage(id: number): Promise<Image | null> {
    return this.requireDb().getImageById(id);
  }

  // Structural invalidation — image set changed (add/hide/delete/scan/missing).
  private invalidateImageCache() {
    this.imageCache.clear();
    this.shuffledIdCache.clear();
  }

  // User-triggered reshuffle: drop every cached order and page so the next
  // fetch rebuilds shuffles with a fresh seed.
  reshuffle(): void {
    this.invalidateImageCache();
  }

  // Metadata/tag edit — preserve the default shuffle (its membership is only
  // driven by hidden/missing, which metadata edits never touch), but drop the
  // page cache (stale fields/tags) and non-default shuffles whose membership
  // may have changed (favorites toggled, tag set changed).
  private invalidateMetadataCaches() {
    this.imageCache.clear();
    for (const key of Array.from(this.shuffledIdCache.keys())) {
      if (key !== 'default') this.shuffledIdCache.delete(key);
    }
  }

  async queryImages(q: Query): Promise<SearchResult[]> {
    const db = this.requireDb();
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;

    const hasText = !!q.text && q.text.trim().length > 0;
    const hasBytes = !!q.imageBytes && q.imageBytes.byteLength > 0;
    const hasPalette = !!q.palette && q.palette.length > 0;

    const setIds = this.buildSetFilterIds(q);

    if (hasText || hasBytes) {
      if (!this.embedder) throw new Error('Embedder not initialized');
      const embedding = hasText
        ? await this.embedder.embedText(q.text!)
        : await this.embedder.embedImage(Buffer.from(q.imageBytes!));
      return this.embeddingQuery(embedding, setIds, limit, offset);
    }
    if (hasPalette) {
      return this.paletteQuery(q.palette!, setIds, limit, offset);
    }

    const ids =
      setIds ??
      this.getOrBuildShuffledIds(
        'default',
        () => db.getVisibleImageIds(),
      );
    const pageIds = ids.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds) as SearchResult[];
  }

  // Returns ids matching every active set filter, or null if none are active.
  private buildSetFilterIds(q: Query): number[] | null {
    const where: string[] = [];
    const params: SqlBinding[] = [];

    where.push(q.includeHidden ? 'i.missing = 0' : 'i.hidden = 0 AND i.missing = 0');

    let active = false;
    if (q.favorites) {
      where.push('i.favorite = 1');
      active = true;
    }
    if (q.personId != null) {
      where.push('EXISTS (SELECT 1 FROM faces f WHERE f.image_id = i.id AND f.person_id = ?)');
      params.push(q.personId);
      active = true;
    }
    if (q.folderId != null) {
      where.push(
        "EXISTS (SELECT 1 FROM folders fo WHERE fo.id = ? AND i.file_path LIKE fo.path || '/%')",
      );
      params.push(q.folderId);
      active = true;
    }
    if (q.tags && q.tags.length > 0) {
      const placeholders = q.tags.map(() => '?').join(',');
      where.push(
        `(SELECT COUNT(DISTINCT t.id)
            FROM image_tags it JOIN tags t ON it.tag_id = t.id
            WHERE it.image_id = i.id AND t.name IN (${placeholders})) = ?`,
      );
      params.push(...q.tags, q.tags.length);
      active = true;
    }
    if (q.dateRange?.start) {
      where.push('i.captured_at >= ?');
      params.push(q.dateRange.start);
      active = true;
    }
    if (q.dateRange?.end) {
      where.push('i.captured_at <= ?');
      params.push(q.dateRange.end);
      active = true;
    }
    if (q.includeHidden) active = true;

    if (!active) return null;

    const cacheKey = this.setFilterCacheKey(q);
    return this.getOrBuildShuffledIds(
      cacheKey,
      () => this.queryIds(`SELECT i.id FROM images i WHERE ${where.join(' AND ')}`, params),
    );
  }

  private setFilterCacheKey(q: Query): string {
    const parts: string[] = [];
    if (q.favorites) parts.push('fav');
    if (q.includeHidden) parts.push('hid');
    if (q.personId != null) parts.push(`p${q.personId}`);
    if (q.folderId != null) parts.push(`f${q.folderId}`);
    if (q.tags && q.tags.length > 0) parts.push(`t=${[...q.tags].sort().join(',')}`);
    if (q.dateRange?.start) parts.push(`ds=${q.dateRange.start}`);
    if (q.dateRange?.end) parts.push(`de=${q.dateRange.end}`);
    return `set:${parts.join('|')}`;
  }

  // Widen `k` when set filters are active so post-filter intersection still fills a page. `cap` is the knn hard ceiling.
  private scoredOverfetch(limit: number, setIds: number[] | null, cap: number): number {
    const desired = setIds
      ? Math.min(Math.max(limit * 50, 500), Math.max(setIds.length, limit + 100))
      : limit + 100;
    return Math.min(desired, cap);
  }

  private embeddingQuery(
    embedding: number[],
    setIds: number[] | null,
    limit: number,
    offset: number,
  ): SearchResult[] {
    const db = this.requireDb();

    const SIMILARITY_DISTANCE_THRESHOLD = 1.3;
    // sqlite-vec knn queries cap `k` at 4096.
    const VEC_K_LIMIT = 4096;
    const k = this.scoredOverfetch(offset + limit, setIds, VEC_K_LIMIT);
    const setIdSet = setIds ? new Set(setIds) : null;

    const stmt = db.getDatabase().prepare(`
      SELECT sub.rowid, sub.distance
      FROM (
        SELECT v.rowid, v.distance
        FROM vec_images v
        WHERE v.embedding MATCH ? AND k = ?
      ) sub
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0 AND i.missing = 0
      WHERE sub.distance < ?
      ORDER BY sub.distance
    `);
    const ranked = stmt.all(JSON.stringify(embedding), k, SIMILARITY_DISTANCE_THRESHOLD) as Array<{
      rowid: number;
      distance: number;
    }>;

    const kept: Array<{ rowid: number; distance: number }> = [];
    for (const r of ranked) {
      if (setIdSet && !setIdSet.has(r.rowid)) continue;
      kept.push(r);
    }

    const page = kept.slice(offset, offset + limit);
    const imageIds = page.map((r) => r.rowid);
    if (imageIds.length === 0) return [];

    const placeholders = imageIds.map(() => '?').join(',');
    const imageStmt = db.getDatabase().prepare(`
      SELECT * FROM images WHERE id IN (${placeholders})
    `);
    const rows = imageStmt.all(...imageIds) as ImageDbRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const distanceMap = new Map(page.map((r) => [r.rowid, r.distance]));

    const results: SearchResult[] = [];
    for (const id of imageIds) {
      const row = byId.get(id);
      if (!row) continue;
      results.push({
        ...row,
        embedded: true,
        palette: hydratePalette(row),
        distance: distanceMap.get(id),
        tags: db.getImageTags(id) as Tag[],
      });
    }
    return results;
  }

  private paletteQuery(
    hexColors: string[],
    setIds: number[] | null,
    limit: number,
    offset: number,
  ): SearchResult[] {
    const db = this.requireDb();
    const labs: Array<[number, number, number]> = [];
    for (const hex of hexColors) {
      const lab = hexToOklab(hex);
      if (lab) labs.push(lab);
    }
    if (labs.length === 0) return [];

    // findImagesByColors multiplies by 10 internally; sqlite-vec's k caps at 4096.
    const PALETTE_LIMIT_CAP = 409;
    const overfetch = this.scoredOverfetch(offset + limit, setIds, PALETTE_LIMIT_CAP);
    const ranked = db.findImagesByColors(labs, overfetch);
    const setIdSet = setIds ? new Set(setIds) : null;

    const kept: Array<{ imageId: number; score: number }> = [];
    for (const m of ranked) {
      if (setIdSet && !setIdSet.has(m.imageId)) continue;
      kept.push(m);
    }

    const page = kept.slice(offset, offset + limit);
    if (page.length === 0) return [];

    const placeholders = page.map(() => '?').join(',');
    const imageStmt = db.getDatabase().prepare(
      `SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
       FROM images i WHERE i.id IN (${placeholders})`,
    );
    const rows = imageStmt.all(...page.map((m) => m.imageId)) as ImageDbRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const results: SearchResult[] = [];
    for (const m of page) {
      const row = byId.get(m.imageId);
      if (!row) continue;
      results.push({
        ...row,
        embedded: !!row.embedded,
        palette: hydratePalette(row),
        distance: m.score,
        tags: db.getImageTags(row.id) as Tag[],
      });
    }
    return results;
  }

  async findSimilarImages(imageId: number, limit: number = 20): Promise<SearchResult[]> {
    const db = this.requireDb();
    const embedding = db.getEmbedding(imageId);
    if (!embedding) return [];

    const results = db
      .findNearestImageMatches(embedding, limit + 1)
      .filter((match) => match.rowid !== imageId);
    const imageIds = results.map((result) => result.rowid);
    if (imageIds.length === 0) return [];

    const distanceMap = new Map(results.map((r) => [r.rowid, r.distance]));
    const resultImages: SearchResult[] = db.getImagesByIds(imageIds).map((image) => ({
      ...image,
      distance: distanceMap.get(image.id),
    }));

    // IN query doesn't preserve order
    resultImages.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return resultImages;
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
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const txn = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE image_id = ? AND source = 'user'`).run(imageId);

      const insertTag = db.prepare(
        `INSERT OR IGNORE INTO tags (name, category) VALUES (?, 'user')`,
      );
      const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const nextPosition = db.prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?`,
      );
      const linkTag = db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, position) VALUES (?, ?, 'user', ?)`,
      );

      for (const name of tagNames) {
        insertTag.run(name);
        const row = getTagId.get(name) as { id: number } | undefined;
        if (row) {
          const { next } = nextPosition.get(row.id) as { next: number };
          linkTag.run(imageId, row.id, next);
        }
      }
    });
    txn();

    this.invalidateMetadataCaches();
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
    if (!this.db) throw new Error('Database not initialized');
    this.db.setImageHidden(imageId);
    this.invalidateImageCache();
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
    if (!this.db) throw new Error('Database not initialized');
    this.db.updateImageMetadata(imageId, metadata);
    this.invalidateMetadataCaches();
  }

  async getLinkPreview(url: string): Promise<LinkPreview | null> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getLinkPreview(hashUrl(url));
  }

  async fetchAndCacheLinkPreview(url: string): Promise<LinkPreview> {
    if (!this.db) throw new Error('Database not initialized');
    const preview = await fetchLinkPreview(url);
    this.db.saveLinkPreview(hashUrl(preview.url), preview);
    return preview;
  }

  async getAllTags(): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getAllTags() as Tag[];
  }

  async getTagsWithCounts(): Promise<Array<Tag & { usage_count: number }>> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getTagsWithCounts() as Array<Tag & { usage_count: number }>;
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
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');

    const normalizedPath = path.resolve(filePath);
    const fileName = path.basename(filePath);

    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || null;

    // Extract the embedded JPEG once (RAW only — no-op for regular files)
    // and thread it through every downstream pipeline. Before this, each of
    // exif/clip/palette/face re-ran exiftool independently on RAW indexing.
    const loaded = await loadImageInput(filePath);

    const [exifData, fileHash] = await Promise.all([
      extractExif(filePath, loaded),
      computeFileHash(filePath),
    ]);

    const imageData: Omit<Image, 'id' | 'created_at' | 'modified_at'> = {
      file_path: normalizedPath,
      file_name: fileName,
      file_size: stats.size,
      mime_type: mimeType,
      width: exifData.width,
      height: exifData.height,
      captured_at: exifData.capturedAt ? exifData.capturedAt.toISOString() : null,
      latitude: exifData.latitude,
      longitude: exifData.longitude,
      city: null, // TODO: reverse geocoding
      country: null,
      description: null,
      favorite: false,
      hidden: false,
      missing: false,
      camera_make: exifData.cameraMake,
      camera_model: exifData.cameraModel,
      aperture: exifData.aperture,
      iso: exifData.iso,
      exposure_time: exifData.exposureTime,
      focal_length: exifData.focalLength,
      file_hash: fileHash,
      dhash: null,
    };

    const { id: imageId, created, fileHashMatched } = this.db.upsertImage(imageData);

    // File is bit-identical to what we already indexed — embeddings, palette,
    // and faces are still valid. Skip the expensive recompute.
    if (!created && fileHashMatched) {
      this.invalidateImageCache();
      return imageId;
    }

    const [embeddingResult, paletteResult] = await Promise.allSettled([
      this.embedder.embedImage(loaded),
      extractPalette(loaded),
    ]);

    if (embeddingResult.status === 'fulfilled') {
      try {
        this.db.insertEmbedding(imageId, embeddingResult.value);
      } catch (error) {
        console.error(`Failed to insert embedding for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to generate embedding for ${filePath}:`, embeddingResult.reason);
    }

    if (paletteResult.status === 'fulfilled') {
      try {
        this.db.insertPalette(imageId, paletteResult.value);
      } catch (error) {
        console.error(`Failed to insert palette for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to extract palette for ${filePath}:`, paletteResult.reason);
    }

    const folder = this.getFolderForPath(filePath);
    if (!folder?.exclude_from_face_scan) {
      try {
        if (!this.faceScan) {
          throw new Error('Face detection is not available');
        }
        const result = await this.faceScan.processImage(imageId, filePath, loaded);
        for (const personId of result.personIds) {
          this.shuffledIdCache.delete(`person:${personId}`);
        }
      } catch (error) {
        console.error(`Failed face detection for ${filePath}:`, error);
      }
    }

    this.invalidateImageCache();
    return imageId;
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
