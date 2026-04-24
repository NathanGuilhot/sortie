import {
  DatabaseManager,
  ClipEmbedder,
  SuggestionEngine,
  Organizer,
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
  Collection,
  OcrBlock,
  DEFAULT_TAG_COLOR,
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
import path from 'path';
import fs from 'fs/promises';

type SqlBinding = string | number | bigint | Uint8Array | null;

export class DatabaseService {
  private db: DatabaseManager | null = null;
  private embedder: ClipEmbedder | null = null;
  private suggestionEngine: SuggestionEngine | null = null;
  private organizer: Organizer | null = null;
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
    this.organizer = new Organizer(this.db, this.suggestionEngine);
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
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(idQuery);
    const rows = stmt.all(...params) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  private fetchImagesByIdsInOrder(ids: number[]): Image[] {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getImagesByIds(ids);
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
      () => this.db!.getVisibleImageIds(),
    );
    const pageIds = allIds.slice(offset, offset + limit);
    const images = this.fetchImagesByIdsInOrder(pageIds);
    this.imageCache.set(cacheKey, images);
    return images;
  }

  async getImage(id: number): Promise<Image | null> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getImageById(id);
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
        () => this.db!.getVisibleImageIds(),
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
    const embedding = this.db.getEmbedding(imageId);
    if (!embedding) return [];

    const results = this.db
      .findNearestImageMatches(embedding, limit + 1)
      .filter((match) => match.rowid !== imageId);
    const imageIds = results.map((result) => result.rowid);
    if (imageIds.length === 0) return [];

    const distanceMap = new Map(results.map((r) => [r.rowid, r.distance]));
    const resultImages: SearchResult[] = this.db.getImagesByIds(imageIds).map((image) => ({
      ...image,
      distance: distanceMap.get(image.id),
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
      db.prepare(
        `UPDATE images SET missing = 1
         WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
      ).run(normalized + '/%', normalized);
    }
    this.invalidateImageCache();
    return row.id;
  }

  async findOverlappingFolders(
    folderPath: string,
  ): Promise<{ parents: string[]; children: string[] }> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const rows = db
      .prepare(
        `SELECT path FROM folders
         WHERE path <> ?
           AND (? LIKE path || '/%' OR path LIKE ? || '/%')`,
      )
      .all(normalized, normalized, normalized) as { path: string }[];

    const parents: string[] = [];
    const children: string[] = [];
    const childPrefix = normalized + '/';
    for (const { path: p } of rows) {
      if (p.startsWith(childPrefix)) {
        children.push(p);
      } else {
        parents.push(p);
      }
    }
    return { parents, children };
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
    return this.db.listFolders();
  }

  async getFoldersWithStats(): Promise<FolderWithStats[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.listFoldersWithStats();
  }

  async removeFolder(folderPath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const pattern = normalized + '/%';

    const txn = db.transaction(() => {
      // Only delete images that are NOT still covered by another registered
      // folder — if /foo and /foo/bar both exist, removing /foo keeps the
      // files under /foo/bar intact.
      const imageIds = db
        .prepare(
          `SELECT id FROM images
           WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`,
        )
        .all(pattern, normalized) as { id: number }[];

      if (imageIds.length > 0) {
        const deleteVec = db.prepare('DELETE FROM vec_images WHERE rowid = ?');
        const deletePaletteVec = db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        const selectPaletteIds = db.prepare('SELECT id FROM palette_colors WHERE image_id = ?');
        const deleteImage = db.prepare('DELETE FROM images WHERE id = ?');
        for (const { id } of imageIds) {
          deleteVec.run(id);
          const colorIds = selectPaletteIds.all(id) as Array<{ id: number }>;
          for (const { id: colorId } of colorIds) {
            deletePaletteVec.run(BigInt(colorId));
          }
          deleteImage.run(id);
        }
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

    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

    // FKs off so we don't depend on delete order.
    db.pragma('foreign_keys = OFF');
    try {
      const txn = db.transaction(() => {
        for (const { name } of rows) {
          db.prepare(`DELETE FROM "${name}"`).run();
        }
      });
      txn();
    } finally {
      db.pragma('foreign_keys = ON');
    }

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
      `INSERT INTO tags (name, category, color) VALUES (?, 'user', COALESCE(?, '${DEFAULT_TAG_COLOR}'))
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
    this.db.renameTag(tagId, trimmed);
    this.invalidateMetadataCaches();
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.setTagColor(tagId, color);
  }

  async deleteBoard(tagId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.deleteTag(tagId);
    this.invalidateMetadataCaches();
  }

  async hideImage(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.setImageHidden(imageId);
    this.invalidateImageCache();
  }

  async markImageMissing(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.setImageMissingByPath(filePath);
    this.invalidateImageCache();
  }

  getFolderForPath(filePath: string): Folder | null {
    if (!this.db) return null;
    return this.db.findFolderForPath(path.resolve(filePath));
  }

  async setFolderAvailability(
    folderPath: string,
    available: boolean,
    writable: boolean,
  ): Promise<{ changed: boolean }> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = path.resolve(folderPath);
    const current = this.db.getFolderAvailabilityState(normalized);
    if (!current) return { changed: false };
    const availableChanged = current.available !== available;
    const writableChanged = current.writable !== writable;
    if (!availableChanged && !writableChanged) return { changed: false };

    const txn = this.db.getDatabase().transaction(() => {
      this.db!.updateFolderAvailabilityState(normalized, available, writable);
      if (availableChanged) {
        const pattern = normalized + '/%';
        if (available) {
          this.db!.clearMissingByPathPrefix(pattern);
        } else {
          this.db!.markMissingByPathPrefix(pattern, normalized);
        }
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
    const normalized = path.resolve(folderPath);
    const current = this.db.getFolderFaceScanExclusion(normalized);
    if (current === null) return { changed: false };
    if (current === excluded) return { changed: false };

    const pattern = normalized + '/%';
    const txn = this.db.getDatabase().transaction(() => {
      this.db!.setFolderFaceScanExclusionFlag(normalized, excluded);
      if (excluded) {
        this.db!.deleteFacesByImagePathPrefix(pattern);
        this.db!.markFacesUnscannedByPathPrefix(pattern);
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

  async processExistingImagesForFaces(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<FaceScanResult> {
    if (!this.faceScan) {
      throw new Error(
        'Face detection is not available. The face-api models may have failed to load.',
      );
    }

    const result = await this.faceScan.processPendingImages(onProgress, signal);
    for (const personId of result.personIds) {
      this.shuffledIdCache.delete(`person:${personId}`);
    }
    for (const key of Array.from(this.shuffledIdCache.keys())) {
      if (key.startsWith('person:')) {
        this.shuffledIdCache.delete(key);
      }
    }

    return {
      scanned: result.scanned,
      detected: result.detected,
      cancelled: result.cancelled,
    };
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
      () => this.db!.getPersonImageIds(personId),
    );
    const pageIds = allIds.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds);
  }

  async getPersonThumbnails(personIds: number[]): Promise<Face[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getThumbnailFacesForPersons(personIds);
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

  getSetting(key: AppSettingKey): string | null {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getSetting(key);
  }

  setSetting(key: AppSettingKey, value: string): void {
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
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');
    const filePath = this.db.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);

    const embedding = await this.embedder.embedImage(filePath);
    this.db.insertEmbedding(imageId, embedding);
    this.invalidateImageCache();
  }

  async recomputePalette(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const filePath = this.db.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);
    const palette = await extractPalette(filePath);
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
    const rows = this.db.getImagesMissingFileHash();

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
        this.db.updateImageFileHash(row.id, fileHash);
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

    // Cosine distance threshold for "near-duplicate" via CLIP embeddings.
    // Embeddings are L2-normalized so distance ∈ [0, 2]; near-identical photos
    // (re-encodes, light edits, crops) sit well under 0.10. Stricter than the
    // search threshold (1.3) by design.
    const NEAR_DUPLICATE_DISTANCE = 0.1;
    // Per-image candidate pool when querying sqlite-vec. Small enough to be
    // fast, large enough to capture all true near-duplicates of a single image.
    const VEC_K = 12;

    const images = this.db.getVisibleImagesForDuplicates();
    const imagesById = new Map(images.map((img) => [img.id, img]));

    const dismissed = this.db.getDismissedDuplicatePairs();
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
    for (const img of images) {
      const embedding = this.db.getEmbedding(img.id);
      if (!embedding) continue;

      const matches = this.db.findNearestImageMatches(embedding, VEC_K);

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
    this.db.dismissDuplicatePair(lo, hi);
  }

  async deleteImage(imageId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const filePath = this.db.getImagePath(imageId);
    if (!filePath) return;

    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw new FileDeletionError(filePath, code, error as Error);
      }
    }
    this.db.deleteImageRecord(imageId);
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
