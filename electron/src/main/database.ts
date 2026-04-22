import {
  DatabaseManager,
  ClipEmbedder,
  SuggestionEngine,
  Organizer,
  TagSuggestion,
  Collection,
  extractExif,
  computeFileHash,
  extractPalette,
  hexToOklab,
  FaceDetector,
  FaceMatcher,
  loadImageInput,
  createOcrEngine,
  type OcrEngine,
  type OcrBlock,
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
  OcrResult,
  OcrUpdatePayload,
  PaletteColor,
  SUPPORTED_IMAGE_EXTENSIONS,
} from 'shared';
import { fetchLinkPreview, hashUrl } from './linkPreview';
import path from 'path';
import fs from 'fs/promises';

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

interface ImageDbRow extends Omit<Image, 'embedded' | 'palette'> {
  embedded: number;
  palette_json?: string | null;
}

function hydratePalette(row: ImageDbRow): PaletteColor[] | null {
  if (!row.palette_json) return null;
  try {
    return JSON.parse(row.palette_json) as PaletteColor[];
  } catch {
    return null;
  }
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
};

export class DatabaseService {
  private db: DatabaseManager | null = null;
  private embedder: ClipEmbedder | null = null;
  private suggestionEngine: SuggestionEngine | null = null;
  private organizer: Organizer | null = null;
  private faceDetector: FaceDetector | null = null;
  private faceMatcher: FaceMatcher | null = null;
  private imageCache = new Map<string, Image[]>();
  // Per-view shuffled ID lists. Built lazily on first request and reused for
  // pagination so LIMIT/OFFSET pages stay stable within a session. A new
  // DatabaseService is created per app launch, so each launch gets a fresh
  // shuffle — this is the "new discovery every time you open the app" behavior.
  // Keys: 'default', 'favorites', 'tags:<sorted,csv>', 'person:<id>'.
  private shuffledIdCache = new Map<string, number[]>();
  private embedderStatus: EmbedderStatus = { state: 'idle' };
  private embedderStatusListeners = new Set<(status: EmbedderStatus) => void>();

  private ocrEngine: OcrEngine | null = null;
  private ocrReady = false;
  private ocrInitPromise: Promise<void> | null = null;
  private ocrQueue: Promise<void> = Promise.resolve();
  private ocrInFlight = new Map<number, Promise<OcrBlock[]>>();
  private ocrUpdateListeners = new Set<(payload: OcrUpdatePayload) => void>();

  initialize(
    dbPath: string,
    faceModelsPath: string,
    faceCacheDir?: string,
    clipCacheDir?: string,
    ocrModelsPath?: string,
  ) {
    this.db = new DatabaseManager(dbPath);
    this.embedder = new ClipEmbedder(clipCacheDir);
    this.suggestionEngine = new SuggestionEngine(dbPath);
    this.organizer = new Organizer(dbPath);
    this.faceDetector = new FaceDetector(faceModelsPath, faceCacheDir);
    this.faceMatcher = new FaceMatcher(this.db);
    if (ocrModelsPath) {
      this.ocrEngine = createOcrEngine({ modelsPath: ocrModelsPath });
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

  // --- OCR ---

  private async ensureOcrReady(): Promise<void> {
    if (!this.ocrEngine) throw new Error('OCR not available (models not found)');
    if (this.ocrReady) return;
    if (this.ocrInitPromise) return this.ocrInitPromise;
    this.ocrInitPromise = this.ocrEngine.initialize().then(() => {
      this.ocrReady = true;
    });
    try {
      await this.ocrInitPromise;
    } catch (err) {
      this.ocrInitPromise = null;
      throw err;
    }
  }

  isOcrAvailable(): boolean {
    return !!this.ocrEngine;
  }

  getOcr(imageId: number): OcrResult {
    if (!this.db) throw new Error('Database not initialized');
    const { status, at } = this.db.getOcrStatus(imageId);
    if (status !== 'done') return { status, at, blocks: [] };
    const rows = this.db.getImageOcr(imageId);
    const blocks: OcrBlock[] = rows.map((r) => {
      let polygon: OcrBlock['polygon'];
      if (r.polygon_json) {
        try {
          polygon = JSON.parse(r.polygon_json) as OcrBlock['polygon'];
        } catch {
          polygon = undefined;
        }
      }
      return {
        text: r.text,
        bbox: { x: r.bbox_x, y: r.bbox_y, width: r.bbox_w, height: r.bbox_h },
        polygon,
        confidence: r.confidence,
      };
    });
    return { status, at, blocks };
  }

  ensureOcr(imageId: number): Promise<OcrBlock[]> {
    if (!this.db) throw new Error('Database not initialized');
    const cached = this.getOcr(imageId);
    if (cached.status === 'done' || cached.status === 'empty') {
      return Promise.resolve(cached.blocks);
    }
    const existing = this.ocrInFlight.get(imageId);
    if (existing) return existing;

    const run = (async () => {
      const filePath = this.db!.getImagePath(imageId);
      if (!filePath) throw new Error(`Image ${imageId} not found`);

      await this.ensureOcrReady();
      try {
        const blocks = await this.ocrEngine!.extract(filePath);
        this.db!.saveImageOcr(imageId, blocks);
        this.notifyOcrUpdate({
          imageId,
          status: blocks.length === 0 ? 'empty' : 'done',
          blocks,
        });
        return blocks;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ocr] failed for image ${imageId}:`, error);
        this.db!.markOcrError(imageId, message);
        this.notifyOcrUpdate({ imageId, status: `error:${message}`, blocks: [] });
        throw error;
      }
    })();

    // Serialize through a shared chain so we never run multiple OCR inferences
    // at once — ONNX is CPU-heavy and would starve CLIP/face/palette workers.
    const serialized = this.ocrQueue.then(() => run).catch(() => undefined);
    this.ocrQueue = serialized as Promise<void>;
    this.ocrInFlight.set(imageId, run);
    run.finally(() => this.ocrInFlight.delete(imageId));
    return run;
  }

  onOcrUpdate(listener: (payload: OcrUpdatePayload) => void): () => void {
    this.ocrUpdateListeners.add(listener);
    return () => {
      this.ocrUpdateListeners.delete(listener);
    };
  }

  private notifyOcrUpdate(payload: OcrUpdatePayload): void {
    for (const listener of this.ocrUpdateListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ocr] update listener error:', err);
      }
    }
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

  // Fisher-Yates shuffle in place.
  private shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  private getOrBuildShuffledIds(
    cacheKey: string,
    idQuery: string,
    params: unknown[] = [],
  ): number[] {
    const cached = this.shuffledIdCache.get(cacheKey);
    if (cached) return cached;
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(idQuery);
    const rows = stmt.all(...(params as never[])) as Array<{ id: number }>;
    const ids = rows.map((r) => r.id);
    this.shuffleInPlace(ids);
    this.shuffledIdCache.set(cacheKey, ids);
    return ids;
  }

  private fetchImagesByIdsInOrder(ids: number[]): Image[] {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.getDatabase().prepare(`
      SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
      FROM images i
      WHERE i.id IN (${placeholders})
    `);
    const rows = stmt.all(...ids) as ImageDbRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const images: Image[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) {
        const { palette_json: _ignored, ...rest } = row;
        images.push({ ...rest, embedded: !!row.embedded, palette: hydratePalette(row) });
      }
    }
    for (const image of images) {
      image.tags = this.db.getImageTags(image.id) as Tag[];
    }
    return images;
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const cacheKey = `images:${limit}:${offset}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const allIds = this.getOrBuildShuffledIds(
      'default',
      `SELECT id FROM images WHERE hidden = 0 AND missing = 0`,
    );
    const pageIds = allIds.slice(offset, offset + limit);
    const images = this.fetchImagesByIdsInOrder(pageIds);
    this.imageCache.set(cacheKey, images);
    return images;
  }

  async getImage(id: number): Promise<Image | null> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(`
      SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
      FROM images i
      WHERE i.id = ?
    `);
    const row = stmt.get(id) as ImageDbRow | undefined;
    if (!row) return null;
    const { palette_json: _ignored, ...rest } = row;
    const image: Image = { ...rest, embedded: !!row.embedded, palette: hydratePalette(row) };
    image.tags = this.db.getImageTags(image.id) as Tag[];
    return image;
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
    if (!this.db) throw new Error('Database not initialized');
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
        `SELECT id FROM images WHERE hidden = 0 AND missing = 0`,
      );
    const pageIds = ids.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds) as SearchResult[];
  }

  // Returns ids matching every active set filter, or null if none are active.
  private buildSetFilterIds(q: Query): number[] | null {
    const where: string[] = [];
    const params: unknown[] = [];

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
      `SELECT i.id FROM images i WHERE ${where.join(' AND ')}`,
      params,
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
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db;

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
    if (!this.db) throw new Error('Database not initialized');
    const labs: Array<[number, number, number]> = [];
    for (const hex of hexColors) {
      const lab = hexToOklab(hex);
      if (lab) labs.push(lab);
    }
    if (labs.length === 0) return [];

    // findImagesByColors multiplies by 10 internally; sqlite-vec's k caps at 4096.
    const PALETTE_LIMIT_CAP = 409;
    const overfetch = this.scoredOverfetch(offset + limit, setIds, PALETTE_LIMIT_CAP);
    const ranked = this.db.findImagesByColors(labs, overfetch);
    const setIdSet = setIds ? new Set(setIds) : null;

    const kept: Array<{ imageId: number; score: number }> = [];
    for (const m of ranked) {
      if (setIdSet && !setIdSet.has(m.imageId)) continue;
      kept.push(m);
    }

    const page = kept.slice(offset, offset + limit);
    if (page.length === 0) return [];

    const db = this.db;
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
    if (!this.db) throw new Error('Database not initialized');
    const dbManager = this.db;
    const db = dbManager.getDatabase();

    const embRow = db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as
      | { embedding: Buffer }
      | undefined;
    if (!embRow) return [];

    const buf = embRow.embedding;
    const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const embJson = JSON.stringify(Array.from(floats));

    // Request limit+1 to account for the source image appearing in results
    const stmt = db.prepare(`
      SELECT sub.rowid, sub.distance
      FROM (
        SELECT v.rowid, v.distance
        FROM vec_images v
        WHERE v.embedding MATCH ? AND k = ?
      ) sub
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0 AND i.missing = 0
      WHERE sub.rowid != ?
      ORDER BY sub.distance
    `);
    const results = stmt.all(embJson, limit + 1, imageId) as Array<{
      rowid: number;
      distance: number;
    }>;

    const imageIds = results.map((r) => r.rowid);
    if (imageIds.length === 0) return [];

    const placeholders = imageIds.map(() => '?').join(',');
    const imageStmt = db.prepare(`
      SELECT * FROM images WHERE id IN (${placeholders})
    `);
    const images = imageStmt.all(...imageIds) as ImageDbRow[];

    const distanceMap = new Map(results.map((r) => [r.rowid, r.distance]));
    const resultImages: SearchResult[] = images.map((img) => ({
      ...img,
      embedded: true,
      palette: hydratePalette(img),
      distance: distanceMap.get(img.id),
      tags: dbManager.getImageTags(img.id) as Tag[],
    }));

    // IN query doesn't preserve order
    resultImages.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return resultImages;
  }

  async addFolder(folderPath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    let available = true;
    try {
      await fs.access(normalized);
    } catch {
      available = false;
    }
    db.prepare('INSERT OR IGNORE INTO folders (path, available) VALUES (?, ?)').run(
      normalized,
      available ? 1 : 0,
    );
    db.prepare('UPDATE folders SET available = ? WHERE path = ?').run(
      available ? 1 : 0,
      normalized,
    );
    const row = db.prepare('SELECT id FROM folders WHERE path = ?').get(normalized) as
      | { id: number }
      | undefined;
    if (!row) throw new Error('Folder insert failed');
    if (!available) {
      db.prepare('UPDATE images SET missing = 1 WHERE file_path LIKE ?').run(normalized + '/%');
    }
    this.invalidateImageCache();
    return row.id;
  }

  async scanFolder(
    folderPath: string,
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<ScanFolderResult> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = path.resolve(folderPath);
    let reachable = true;
    try {
      await fs.access(normalized);
    } catch {
      reachable = false;
    }
    const folderId = await this.addFolder(normalized);
    if (!reachable) {
      console.log(`[scan] folder ${normalized} is offline; skipping scan`);
      return { folderId, processed: 0, cancelled: false };
    }

    const imageFiles: string[] = [];

    async function walk(dir: string): Promise<void> {
      if (signal?.aborted) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (signal?.aborted) return;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    }

    console.log(`Scanning folder ${normalized} for images...`);
    await walk(normalized);
    console.log(`Found ${imageFiles.length} image files`);

    let processed = 0;
    let cancelled = false;
    for (let i = 0; i < imageFiles.length; i++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const file = imageFiles[i];
      try {
        await this.addImage(file);
        processed++;
      } catch (error) {
        console.error(`Failed to process ${file}:`, error);
      }
      onProgress?.({ current: i + 1, total: imageFiles.length, currentFile: file });
    }

    const stmt = this.db.getDatabase().prepare(`
      UPDATE folders SET last_scanned = datetime('now') WHERE path = ?
    `);
    stmt.run(normalized);

    console.log(`Scan completed: ${processed} images processed${cancelled ? ' (cancelled)' : ''}`);
    return { folderId, processed, cancelled };
  }

  async getFolders(): Promise<Folder[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(`
      SELECT * FROM folders ORDER BY created_at DESC
    `);
    return stmt.all() as Folder[];
  }

  async getFoldersWithStats(): Promise<FolderWithStats[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(`
      SELECT f.*,
        COALESCE(s.image_count, 0) AS image_count,
        COALESCE(s.total_size, 0) AS total_size
      FROM folders f
      LEFT JOIN (
        SELECT fo.id AS folder_id,
          COUNT(i.id) AS image_count,
          SUM(i.file_size) AS total_size
        FROM folders fo
        LEFT JOIN images i ON i.file_path LIKE fo.path || '/%' AND i.hidden = 0 AND i.missing = 0
        GROUP BY fo.id
      ) s ON s.folder_id = f.id
      ORDER BY f.created_at DESC
    `);
    const rows = stmt.all() as (Folder & { image_count: number; total_size: number })[];
    return rows.map((row) => ({
      ...row,
      folder_name: path.basename(row.path) || row.path,
    }));
  }

  async removeFolder(folderPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const pattern = normalized + '/%';

    const txn = db.transaction(() => {
      const imageIds = db.prepare('SELECT id FROM images WHERE file_path LIKE ?').all(pattern) as {
        id: number;
      }[];

      if (imageIds.length > 0) {
        const deleteVec = db.prepare('DELETE FROM vec_images WHERE rowid = ?');
        const deletePaletteVec = db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        const selectPaletteIds = db.prepare('SELECT id FROM palette_colors WHERE image_id = ?');
        for (const { id } of imageIds) {
          deleteVec.run(id);
          const colorIds = selectPaletteIds.all(id) as Array<{ id: number }>;
          for (const { id: colorId } of colorIds) {
            deletePaletteVec.run(BigInt(colorId));
          }
        }
        db.prepare('DELETE FROM images WHERE file_path LIKE ?').run(pattern);
      }

      db.prepare('DELETE FROM folders WHERE path = ?').run(normalized);
    });
    txn();

    this.invalidateImageCache();
  }

  async resetFaceData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM vec_faces').run();
      db.prepare('DELETE FROM vec_persons').run();
      db.prepare('DELETE FROM faces').run();
      db.prepare('DELETE FROM persons').run();
      db.prepare('UPDATE images SET faces_scanned = 0').run();
    });
    txn();
  }

  async resetDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM vec_faces').run();
      db.prepare('DELETE FROM vec_persons').run();
      db.prepare('DELETE FROM faces').run();
      db.prepare('DELETE FROM persons').run();
      db.prepare('DELETE FROM vec_images').run();
      db.prepare('DELETE FROM vec_palette').run();
      db.prepare('DELETE FROM palette_colors').run();
      db.prepare('DELETE FROM images').run();
      db.prepare('DELETE FROM collections').run();
      db.prepare('DELETE FROM tags').run();
      db.prepare('DELETE FROM folders').run();
    });
    txn();

    this.invalidateImageCache();
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

  private queryBoards(extraWhere: string = '', params: unknown[] = []): Board[] {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .getDatabase()
      .prepare(
        `WITH cover AS (
           SELECT it.tag_id, it.image_id, img.file_path,
                  ROW_NUMBER() OVER (
                    PARTITION BY it.tag_id
                    ORDER BY COALESCE(it.position, 1000000000), it.created_at DESC
                  ) AS rn
           FROM image_tags it
           INNER JOIN images img ON img.id = it.image_id
           WHERE img.hidden = 0 AND img.missing = 0
         ),
         previews AS (
           SELECT tag_id, json_group_array(file_path) AS paths
           FROM (
             SELECT tag_id, file_path, rn FROM cover WHERE rn <= 4 ORDER BY tag_id, rn
           )
           GROUP BY tag_id
         )
         SELECT
           t.id,
           t.name,
           t.color,
           COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS image_count,
           (SELECT c.image_id FROM cover c WHERE c.tag_id = t.id AND c.rn = 1) AS cover_image_id,
           (SELECT c.file_path FROM cover c WHERE c.tag_id = t.id AND c.rn = 1) AS cover_image_path,
           (SELECT p.paths FROM previews p WHERE p.tag_id = t.id) AS preview_paths_json
         FROM tags t
         LEFT JOIN image_tags it ON t.id = it.tag_id
         LEFT JOIN images i ON i.id = it.image_id AND i.hidden = 0 AND i.missing = 0
         WHERE t.category IN ('user', 'ai')${extraWhere ? ` AND ${extraWhere}` : ''}
         GROUP BY t.id
         ORDER BY image_count DESC, t.name ASC`,
      )
      .all(...(params as never[])) as Array<{
      id: number;
      name: string;
      color: string;
      image_count: number;
      cover_image_id: number | null;
      cover_image_path: string | null;
      preview_paths_json: string | null;
    }>;
    return rows.map((row) => {
      const { preview_paths_json, ...rest } = row;
      let preview_image_paths: string[] = [];
      if (preview_paths_json) {
        try {
          const parsed: unknown = JSON.parse(preview_paths_json);
          if (Array.isArray(parsed)) {
            preview_image_paths = parsed.filter((p): p is string => typeof p === 'string');
          }
        } catch {
          preview_image_paths = [];
        }
      }
      return { ...rest, preview_image_paths };
    });
  }

  async getBoards(): Promise<Board[]> {
    return this.queryBoards();
  }

  async getBoard(tagId: number): Promise<Board | null> {
    return this.queryBoards('t.id = ?', [tagId])[0] ?? null;
  }

  async getBoardImages(tagId: number, limit: number = 100, offset: number = 0): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .getDatabase()
      .prepare(
        `SELECT i.id AS id
         FROM images i
         INNER JOIN image_tags it ON i.id = it.image_id
         WHERE it.tag_id = ? AND i.hidden = 0 AND i.missing = 0
         ORDER BY COALESCE(it.position, 1000000000), it.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(tagId, limit, offset) as Array<{ id: number }>;
    return this.fetchImagesByIdsInOrder(rows.map((r) => r.id));
  }

  async reorderBoardImages(tagId: number, orderedImageIds: number[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const stmt = db.prepare(`UPDATE image_tags SET position = ? WHERE tag_id = ? AND image_id = ?`);
    const txn = db.transaction(() => {
      orderedImageIds.forEach((imageId, index) => {
        stmt.run(index, tagId, imageId);
      });
    });
    txn();
    this.invalidateMetadataCaches();
  }

  async addImageToBoard(imageId: number, tagId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const txn = db.transaction(() => {
      const { next } = db
        .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?`)
        .get(tagId) as { next: number };
      db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, position)
         VALUES (?, ?, 'user', ?)`,
      ).run(imageId, tagId, next);
    });
    txn();
    this.invalidateMetadataCaches();
  }

  async removeImageFromBoard(imageId: number, tagId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .getDatabase()
      .prepare(`DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?`)
      .run(imageId, tagId);
    this.invalidateMetadataCaches();
  }

  async createBoard(name: string, color?: string): Promise<Board> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');
    const insert = db.prepare(
      `INSERT INTO tags (name, category, color) VALUES (?, 'user', COALESCE(?, '#6B7280'))
       ON CONFLICT(name) DO UPDATE SET category = COALESCE(tags.category, 'user')`,
    );
    insert.run(trimmed, color ?? null);
    const row = db.prepare(`SELECT id, name, color FROM tags WHERE name = ?`).get(trimmed) as {
      id: number;
      name: string;
      color: string;
    };
    return {
      ...row,
      image_count: 0,
      cover_image_id: null,
      cover_image_path: null,
      preview_image_paths: [],
    };
  }

  async renameBoard(tagId: number, name: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');
    this.db.getDatabase().prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(trimmed, tagId);
    this.invalidateMetadataCaches();
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.getDatabase().prepare(`UPDATE tags SET color = ? WHERE id = ?`).run(color, tagId);
  }

  async deleteBoard(tagId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.getDatabase().prepare(`DELETE FROM tags WHERE id = ?`).run(tagId);
    this.invalidateMetadataCaches();
  }

  async hideImage(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .getDatabase()
      .prepare(`UPDATE images SET hidden = 1, modified_at = datetime('now') WHERE id = ?`)
      .run(imageId);
    this.invalidateImageCache();
  }

  async markImageMissing(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .getDatabase()
      .prepare(`UPDATE images SET missing = 1, modified_at = datetime('now') WHERE file_path = ?`)
      .run(filePath);
    this.invalidateImageCache();
  }

  getFolderForPath(filePath: string): Folder | null {
    if (!this.db) return null;
    const normalized = path.resolve(filePath);
    const stmt = this.db.getDatabase().prepare(`
      SELECT * FROM folders
      WHERE ? LIKE path || '/%' OR ? = path
      ORDER BY length(path) DESC
      LIMIT 1
    `);
    const row = stmt.get(normalized, normalized) as Folder | undefined;
    return row ?? null;
  }

  async setFolderAvailability(
    folderPath: string,
    available: boolean,
    writable: boolean,
  ): Promise<{ changed: boolean }> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const current = db
      .prepare('SELECT available, writable FROM folders WHERE path = ?')
      .get(normalized) as { available: number; writable: number } | undefined;
    if (!current) return { changed: false };
    const availableChanged = !!current.available !== available;
    const writableChanged = !!current.writable !== writable;
    if (!availableChanged && !writableChanged) return { changed: false };

    const txn = db.transaction(() => {
      db.prepare('UPDATE folders SET available = ?, writable = ? WHERE path = ?').run(
        available ? 1 : 0,
        writable ? 1 : 0,
        normalized,
      );
      if (availableChanged) {
        const pattern = normalized + '/%';
        db.prepare('UPDATE images SET missing = ? WHERE file_path LIKE ?').run(
          available ? 0 : 1,
          pattern,
        );
      }
    });
    txn();

    if (availableChanged) {
      this.invalidateImageCache();
    }
    return { changed: true };
  }

  async setFolderFaceScanExclusion(
    folderPath: string,
    excluded: boolean,
  ): Promise<{ changed: boolean }> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const current = db
      .prepare('SELECT exclude_from_face_scan FROM folders WHERE path = ?')
      .get(normalized) as { exclude_from_face_scan: number } | undefined;
    if (!current) return { changed: false };
    if (!!current.exclude_from_face_scan === excluded) return { changed: false };

    const pattern = normalized + '/%';
    const txn = db.transaction(() => {
      db.prepare('UPDATE folders SET exclude_from_face_scan = ? WHERE path = ?').run(
        excluded ? 1 : 0,
        normalized,
      );
      if (excluded) {
        db.prepare(
          `DELETE FROM faces WHERE image_id IN (
             SELECT id FROM images WHERE file_path LIKE ?
           )`,
        ).run(pattern);
        db.prepare('UPDATE images SET faces_scanned = 0 WHERE file_path LIKE ?').run(pattern);
      }
    });
    txn();

    if (excluded) this.db.cleanupOrphanedPersons();
    this.invalidateImageCache();
    return { changed: true };
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
    const db = this.db.getDatabase();

    const fields: string[] = [];
    const values: (string | number | boolean | null | undefined)[] = [];

    if (metadata.description !== undefined) {
      fields.push('description = ?');
      values.push(metadata.description);
    }
    if (metadata.favorite !== undefined) {
      fields.push('favorite = ?');
      values.push(metadata.favorite ? 1 : 0);
    }
    if (metadata.captured_at !== undefined) {
      fields.push('captured_at = ?');
      values.push(metadata.captured_at);
    }
    if (metadata.city !== undefined) {
      fields.push('city = ?');
      values.push(metadata.city);
    }
    if (metadata.country !== undefined) {
      fields.push('country = ?');
      values.push(metadata.country);
    }
    if (metadata.website_link !== undefined) {
      fields.push('website_link = ?');
      values.push(metadata.website_link);
    }

    if (fields.length === 0) return;

    fields.push("modified_at = datetime('now')");
    values.push(imageId);

    db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(
      ...(values as (string | number)[]),
    );
    this.invalidateMetadataCaches();
  }

  async getLinkPreview(url: string): Promise<LinkPreview | null> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const row = db
      .prepare(
        'SELECT url, title, description, site_name, image_path, fetched_at, error FROM link_previews WHERE url_hash = ?',
      )
      .get(hashUrl(url)) as LinkPreview | undefined;
    return row ?? null;
  }

  async fetchAndCacheLinkPreview(url: string): Promise<LinkPreview> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const preview = await fetchLinkPreview(url);
    db.prepare(
      `INSERT OR REPLACE INTO link_previews
        (url_hash, url, title, description, site_name, image_path, fetched_at, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      hashUrl(preview.url),
      preview.url,
      preview.title,
      preview.description,
      preview.site_name,
      preview.image_path,
      preview.fetched_at,
      preview.error,
    );
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
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    const suggestions = await this.suggestionEngine.generateImageSuggestionsForBoard(tagId, 20);
    if (suggestions.length === 0) return [];
    return this.fetchImagesByIdsInOrder(suggestions.map((s) => s.imageId));
  }

  async getCollections(): Promise<Collection[]> {
    if (!this.organizer) throw new Error('Organizer not initialized');
    return this.organizer.getAllCollections();
  }

  async createCollection(name: string, description?: string): Promise<number> {
    if (!this.organizer) throw new Error('Organizer not initialized');
    return this.organizer.createCollection(name, description);
  }

  async organizeImages(): Promise<number[]> {
    if (!this.organizer) throw new Error('Organizer not initialized');
    return this.organizer.createCollectionsFromClusters();
  }

  async fixImageDimensions(): Promise<void> {
    if (!this.db) return;
    const db = this.db.getDatabase();
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version >= 1) return;

    console.log('[migration] fixing image dimensions for EXIF rotation...');
    const rows = db.prepare('SELECT id, file_path, width, height FROM images').all() as Array<{
      id: number;
      file_path: string;
      width: number | null;
      height: number | null;
    }>;
    let fixed = 0;
    for (const row of rows) {
      try {
        const exif = await extractExif(row.file_path);
        if (exif.width !== row.width || exif.height !== row.height) {
          db.prepare('UPDATE images SET width = ?, height = ? WHERE id = ?').run(
            exif.width,
            exif.height,
            row.id,
          );
          fixed++;
        }
      } catch (err) {
        console.warn(`Failed to fix dimensions for ${row.file_path}:`, err);
      }
    }
    db.pragma(`user_version = 1`);
    this.invalidateImageCache();
    console.log(`[migration] fixed dimensions for ${fixed}/${rows.length} images`);
  }

  async backfillExifData(signal?: AbortSignal): Promise<BackfillExifResult> {
    if (!this.db) return { filled: 0, cancelled: false };
    const db = this.db.getDatabase();

    console.log('[migration] backfilling camera EXIF data...');
    const rows = db
      .prepare(
        'SELECT id, file_path FROM images WHERE camera_make IS NULL AND camera_model IS NULL',
      )
      .all() as Array<{ id: number; file_path: string }>;

    let filled = 0;
    let cancelled = false;
    for (const row of rows) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      try {
        const exif = await extractExif(row.file_path);
        if (
          exif.cameraMake ||
          exif.cameraModel ||
          exif.aperture ||
          exif.iso ||
          exif.exposureTime ||
          exif.focalLength
        ) {
          db.prepare(
            `UPDATE images SET camera_make = ?, camera_model = ?, aperture = ?, iso = ?, exposure_time = ?, focal_length = ? WHERE id = ?`,
          ).run(
            exif.cameraMake,
            exif.cameraModel,
            exif.aperture,
            exif.iso,
            exif.exposureTime,
            exif.focalLength,
            row.id,
          );
          filled++;
        }
      } catch (err) {
        console.warn(`Failed to backfill EXIF for ${row.file_path}:`, err);
      }
    }
    this.invalidateImageCache();
    console.log(
      `[migration] backfilled EXIF for ${filled}/${rows.length} images${cancelled ? ' (cancelled)' : ''}`,
    );
    return { filled, cancelled };
  }

  // --- Face Detection / People ---

  private async detectFacesForImage(
    imageId: number,
    filePath: string,
    input?: string | Buffer,
  ): Promise<{ count: number; personIds: number[] }> {
    if (!this.db || !this.faceDetector || !this.faceMatcher) {
      throw new Error('Face detection is not available');
    }

    const faces = await this.faceDetector.detectFaces(filePath, undefined, input);
    if (faces.length === 0) {
      this.db.markImageFacesScanned(imageId);
      return { count: 0, personIds: [] };
    }

    // 1. Insert all faces and their embeddings first.
    const faceIds: number[] = [];
    for (const face of faces) {
      const faceId = this.db.insertFace({
        image_id: imageId,
        person_id: null,
        bbox_x: face.bbox.x,
        bbox_y: face.bbox.y,
        bbox_w: face.bbox.width,
        bbox_h: face.bbox.height,
        confidence: face.confidence,
      });
      this.db.insertFaceEmbedding(faceId, face.descriptor);
      faceIds.push(faceId);
    }

    // 2. Optimally assign faces to persons using the Hungarian algorithm.
    //    This finds the global min-cost pairing so that, e.g., two faces in a
    //    group photo can't both greedily grab the wrong person.
    const descriptors = faces.map((f) => f.descriptor);
    const matches = this.faceMatcher.matchFaces(descriptors);

    // 3. Apply assignments.
    const usedPersonIds = new Set<number>();
    for (let i = 0; i < faceIds.length; i++) {
      this.faceMatcher.assignFaceToPerson(faceIds[i], matches[i].personId);
      usedPersonIds.add(matches[i].personId);
    }

    // 4. Recompute centroids once per affected person after all faces in this
    //    image are assigned, to avoid intra-image centroid drift.
    for (const personId of usedPersonIds) {
      this.faceMatcher.updatePersonCentroid(personId);
    }

    this.db.markImageFacesScanned(imageId);
    for (const personId of usedPersonIds) {
      this.shuffledIdCache.delete(`person:${personId}`);
    }
    return { count: faces.length, personIds: [...usedPersonIds] };
  }

  async processExistingImagesForFaces(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<FaceScanResult> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.faceDetector || !this.faceMatcher) {
      throw new Error(
        'Face detection is not available. The face-api models may have failed to load.',
      );
    }

    const images = this.db.getUnscannedFaceImages();
    let totalFaces = 0;
    let scanned = 0;
    let cancelled = false;

    for (let i = 0; i < images.length; i++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const img = images[i];
      let personIds: number[] = [];
      try {
        const result = await this.detectFacesForImage(img.id, img.file_path);
        totalFaces += result.count;
        personIds = result.personIds;
      } catch (error) {
        console.error(`Failed face detection for ${img.file_path}:`, error);
        this.db.markImageFacesScanned(img.id);
      }
      scanned++;
      const personUpdates = personIds
        .map((pid) => this.db!.getPersonById(pid))
        .filter((p): p is Person => p !== null && p !== undefined);
      onProgress?.({
        current: i + 1,
        total: images.length,
        currentFile: img.file_path,
        personUpdates,
      });

      // Yield to event loop between images to prevent UI freezes
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    for (const key of Array.from(this.shuffledIdCache.keys())) {
      if (key.startsWith('person:')) {
        this.shuffledIdCache.delete(key);
      }
    }

    return { scanned, detected: totalFaces, cancelled };
  }

  async getPersons(): Promise<Person[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getAllPersons();
  }

  async getPersonImages(
    personId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const allIds = this.getOrBuildShuffledIds(
      `person:${personId}`,
      `SELECT DISTINCT i.id AS id
       FROM images i
       JOIN faces f ON f.image_id = i.id
       WHERE f.person_id = ? AND i.hidden = 0 AND i.missing = 0`,
      [personId],
    );
    const pageIds = allIds.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds);
  }

  async renamePerson(personId: number, name: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.updatePersonName(personId, name);
  }

  async mergePersons(keepPersonId: number, mergePersonId: number): Promise<void> {
    if (!this.faceMatcher) throw new Error('FaceMatcher not initialized');
    this.faceMatcher.mergePersons(keepPersonId, mergePersonId);
    this.shuffledIdCache.delete(`person:${keepPersonId}`);
    this.shuffledIdCache.delete(`person:${mergePersonId}`);
  }

  async splitFaceFromPerson(faceId: number): Promise<number> {
    if (!this.faceMatcher) throw new Error('FaceMatcher not initialized');
    return this.faceMatcher.splitFaceFromPerson(faceId);
  }

  async getImageFaces(imageId: number): Promise<Face[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getImageFaces(imageId);
  }

  async setPersonThumbnail(personId: number, faceId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.updatePersonThumbnail(personId, faceId);
  }

  async deletePerson(personId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.deletePerson(personId);
  }

  getDatabase(): DatabaseManager | null {
    return this.db;
  }

  getSetting(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getSetting(key);
  }

  setSetting(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.setSetting(key, value);
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

    const imageId = this.db.insertImage(imageData);

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
        await this.detectFacesForImage(imageId, filePath, loaded);
      } catch (error) {
        console.error(`Failed face detection for ${filePath}:`, error);
      }
    }

    this.invalidateImageCache();
    return imageId;
  }

  async recomputeEmbedding(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');

    const stmt = this.db.getDatabase().prepare('SELECT file_path FROM images WHERE id = ?');
    const row = stmt.get(imageId) as { file_path: string } | undefined;
    if (!row) throw new Error(`Image ${imageId} not found`);

    const embedding = await this.embedder.embedImage(row.file_path);
    this.db.insertEmbedding(imageId, embedding);
    this.invalidateImageCache();
  }

  async recomputePalette(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare('SELECT file_path FROM images WHERE id = ?');
    const row = stmt.get(imageId) as { file_path: string } | undefined;
    if (!row) throw new Error(`Image ${imageId} not found`);
    const palette = await extractPalette(row.file_path);
    this.db.insertPalette(imageId, palette);
    this.invalidateImageCache();
  }

  async computeMissingPalettes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<{ computed: number; cancelled: boolean }> {
    if (!this.db) throw new Error('Database not initialized');
    const pending = this.db.getImagesMissingPalette();
    let computed = 0;
    let cancelled = false;
    for (let i = 0; i < pending.length; i++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const { id, file_path } = pending[i];
      try {
        const palette = await extractPalette(file_path);
        this.db.insertPalette(id, palette);
        computed++;
      } catch (error) {
        console.error(`Failed to extract palette for ${file_path}:`, error);
      }
      onProgress?.({ current: i + 1, total: pending.length, currentFile: file_path });
    }
    if (computed > 0) this.invalidateImageCache();
    return { computed, cancelled };
  }

  async computeMissingHashes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<HashScanResult> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const rows = db
      .prepare(
        'SELECT id, file_path FROM images WHERE hidden = 0 AND missing = 0 AND file_hash IS NULL',
      )
      .all() as Array<{ id: number; file_path: string }>;

    let computed = 0;
    let cancelled = false;
    for (let i = 0; i < rows.length; i++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }
      const row = rows[i];
      try {
        const fileHash = await computeFileHash(row.file_path);
        db.prepare('UPDATE images SET file_hash = ? WHERE id = ?').run(fileHash, row.id);
        computed++;
      } catch (err) {
        console.warn(`Failed to hash ${row.file_path}:`, err);
      }
      onProgress?.({ current: i + 1, total: rows.length, currentFile: row.file_path });
    }

    this.invalidateImageCache();
    return { computed, cancelled };
  }

  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    // Cosine distance threshold for "near-duplicate" via CLIP embeddings.
    // Embeddings are L2-normalized so distance ∈ [0, 2]; near-identical photos
    // (re-encodes, light edits, crops) sit well under 0.10. Stricter than the
    // search threshold (1.3) by design.
    const NEAR_DUPLICATE_DISTANCE = 0.1;
    // Per-image candidate pool when querying sqlite-vec. Small enough to be
    // fast, large enough to capture all true near-duplicates of a single image.
    const VEC_K = 12;

    const images = db
      .prepare(
        `SELECT id, file_path, file_name, file_size, mime_type, width, height,
                created_at, modified_at, captured_at, latitude, longitude,
                city, country, description, favorite, hidden, file_hash
         FROM images WHERE hidden = 0 AND missing = 0`,
      )
      .all() as Image[];
    const imagesById = new Map(images.map((img) => [img.id, img]));

    const dismissed = db
      .prepare('SELECT image_id_1, image_id_2 FROM dismissed_duplicates')
      .all() as Array<{ image_id_1: number; image_id_2: number }>;
    const pairKey = (a: number, b: number) => `${Math.min(a, b)}_${Math.max(a, b)}`;
    const dismissedSet = new Set(dismissed.map((d) => pairKey(d.image_id_1, d.image_id_2)));

    const groups: DuplicateGroup[] = [];
    const seenPairs = new Set<string>();

    // Phase 1: exact matches via file_hash. One group per hash bucket so users
    // can resolve N-way exact duplicates in one go.
    const hashBuckets = new Map<string, Image[]>();
    for (const img of images) {
      if (!img.file_hash) continue;
      const bucket = hashBuckets.get(img.file_hash) ?? [];
      bucket.push(img);
      hashBuckets.set(img.file_hash, bucket);
    }
    for (const bucket of hashBuckets.values()) {
      if (bucket.length < 2) continue;
      const filtered = bucket.filter((img, idx) => {
        if (idx === 0) return true;
        return !dismissedSet.has(pairKey(bucket[0].id, img.id));
      });
      if (filtered.length < 2) continue;
      for (let i = 0; i < filtered.length; i++) {
        for (let j = i + 1; j < filtered.length; j++) {
          seenPairs.add(pairKey(filtered[i].id, filtered[j].id));
        }
      }
      groups.push({
        groupId: Math.min(...filtered.map((i) => i.id)),
        images: filtered,
        matchType: 'exact',
      });
    }

    // Phase 2: visual matches via CLIP embeddings, emitted as pairwise groups.
    // Skipping single-edge unions avoids the transitive false-grouping problem
    // dHash had ("A≈B and B≈C therefore A,C grouped" even when A and C are
    // unrelated).
    const matchStmt = db.prepare(`
      SELECT v.rowid, v.distance
      FROM vec_images v
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `);

    for (const img of images) {
      const embRow = db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(img.id) as
        | { embedding: Buffer }
        | undefined;
      if (!embRow) continue;

      const buf = embRow.embedding;
      const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const queryJson = JSON.stringify(Array.from(floats));

      const matches = matchStmt.all(queryJson, VEC_K) as Array<{
        rowid: number;
        distance: number;
      }>;

      for (const match of matches) {
        if (match.rowid === img.id) continue;
        if (match.distance > NEAR_DUPLICATE_DISTANCE) break;
        // Pair each image with the lower id once to dedupe and skip self.
        if (img.id >= match.rowid) continue;

        const other = imagesById.get(match.rowid);
        if (!other) continue;
        const key = pairKey(img.id, match.rowid);
        if (dismissedSet.has(key) || seenPairs.has(key)) continue;
        seenPairs.add(key);

        groups.push({
          groupId: Math.min(img.id, match.rowid),
          images: [img, other],
          matchType: 'visual',
        });
      }
    }

    groups.sort((a, b) => b.images.length - a.images.length || a.groupId - b.groupId);
    return groups;
  }

  async dismissDuplicatePair(imageId1: number, imageId2: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const lo = Math.min(imageId1, imageId2);
    const hi = Math.max(imageId1, imageId2);
    this.db
      .getDatabase()
      .prepare('INSERT OR IGNORE INTO dismissed_duplicates (image_id_1, image_id_2) VALUES (?, ?)')
      .run(lo, hi);
  }

  async deleteImage(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const row = db.prepare('SELECT file_path FROM images WHERE id = ?').get(imageId) as
      | { file_path: string }
      | undefined;
    if (!row) return;

    try {
      await fs.unlink(row.file_path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw new FileDeletionError(row.file_path, code, error as Error);
      }
    }
    db.prepare('DELETE FROM images WHERE id = ?').run(imageId);
    this.invalidateImageCache();
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
