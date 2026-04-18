import {
  DatabaseManager,
  ClipEmbedder,
  SuggestionEngine,
  Organizer,
  TagSuggestion,
  Collection,
  extractExif,
  computeDHash,
  computeFileHash,
  hammingDistance,
  DHASH_DUPLICATE_THRESHOLD,
  FaceDetector,
  FaceMatcher,
} from 'pipeline';
import {
  Image,
  Tag,
  Board,
  Face,
  Person,
  Folder,
  FolderWithStats,
  SearchResult,
  DuplicateGroup,
  FaceScanProgress,
  FaceScanResult,
  ScanFolderResult,
  HashScanResult,
  BackfillExifResult,
  EmbedderStatus,
  LinkPreview,
  SUPPORTED_IMAGE_EXTENSIONS,
} from 'shared';
import { fetchLinkPreview, hashUrl } from './linkPreview';
import path from 'path';
import fs from 'fs/promises';

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

interface ImageDbRow extends Omit<Image, 'embedded'> {
  embedded: number;
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

  initialize(
    dbPath: string,
    faceModelsPath: string,
    faceCacheDir?: string,
    clipCacheDir?: string,
  ) {
    this.db = new DatabaseManager(dbPath);
    this.embedder = new ClipEmbedder(clipCacheDir);
    this.suggestionEngine = new SuggestionEngine(dbPath);
    this.organizer = new Organizer(dbPath);
    this.faceDetector = new FaceDetector(faceModelsPath, faceCacheDir);
    this.faceMatcher = new FaceMatcher(this.db);
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
      if (row) images.push({ ...row, embedded: !!row.embedded });
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
    const image: Image = { ...row, embedded: !!row.embedded };
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

  async getFavoriteImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const allIds = this.getOrBuildShuffledIds(
      'favorites',
      `SELECT id FROM images WHERE favorite = 1 AND hidden = 0 AND missing = 0`,
    );
    const pageIds = allIds.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds);
  }

  async getImagesByTags(
    tagNames: string[],
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (tagNames.length === 0) return this.getImages(limit, offset);

    const placeholders = tagNames.map(() => '?').join(',');
    // Cache key must be deterministic for a given tag set — sort first.
    const keyTags = [...tagNames].sort().join(',');
    const allIds = this.getOrBuildShuffledIds(
      `tags:${keyTags}`,
      `SELECT i.id AS id
       FROM images i
       INNER JOIN image_tags it ON i.id = it.image_id
       INNER JOIN tags t ON it.tag_id = t.id
       WHERE i.hidden = 0 AND i.missing = 0 AND t.name IN (${placeholders})
       GROUP BY i.id
       HAVING COUNT(DISTINCT t.id) = ?`,
      [...tagNames, tagNames.length],
    );
    const pageIds = allIds.slice(offset, offset + limit);
    return this.fetchImagesByIdsInOrder(pageIds);
  }

  async searchImages(
    query: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');
    const db = this.db;

    const embedding = await this.embedder.embedText(query);

    // Embeddings are L2-normalized, so distance ∈ [0, 2]. Below ~1.3 corresponds
    // to cosine similarity > ~0.15, which empirically separates real matches
    // from noise for CLIP ViT-B/32 with "a photo of …" prompts.
    const SIMILARITY_DISTANCE_THRESHOLD = 1.3;
    const k = offset + limit + 100;

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
    const allResults = stmt.all(
      JSON.stringify(embedding),
      k,
      SIMILARITY_DISTANCE_THRESHOLD,
    ) as Array<{ rowid: number; distance: number }>;

    const page = allResults.slice(offset, offset + limit);
    const imageIds = page.map((r) => r.rowid);
    if (imageIds.length === 0) return [];

    const placeholders = imageIds.map(() => '?').join(',');
    const imageStmt = db.getDatabase().prepare(`
      SELECT * FROM images WHERE id IN (${placeholders})
    `);
    const images = imageStmt.all(...imageIds) as Image[];

    const distanceMap = new Map(page.map((r) => [r.rowid, r.distance]));
    const searchResults = images.map((img) => ({
      ...img,
      distance: distanceMap.get(img.id),
      tags: db.getImageTags(img.id) as Tag[],
    }));
    searchResults.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

    return searchResults;
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
    const images = imageStmt.all(...imageIds) as Image[];

    const distanceMap = new Map(results.map((r) => [r.rowid, r.distance]));
    const resultImages = images.map((img) => ({
      ...img,
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
      db.prepare("UPDATE images SET missing = 1 WHERE file_path LIKE ?").run(normalized + '/%');
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
      const imageIds = db
        .prepare("SELECT id FROM images WHERE file_path LIKE ?")
        .all(pattern) as { id: number }[];

      if (imageIds.length > 0) {
        const deleteVec = db.prepare('DELETE FROM vec_images WHERE rowid = ?');
        for (const { id } of imageIds) {
          deleteVec.run(id);
        }
        db.prepare("DELETE FROM images WHERE file_path LIKE ?").run(pattern);
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
          const parsed = JSON.parse(preview_paths_json);
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

  async getBoardImages(
    tagId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
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
    const stmt = db.prepare(
      `UPDATE image_tags SET position = ? WHERE tag_id = ? AND image_id = ?`,
    );
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
        .prepare(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?`,
        )
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
    const row = db
      .prepare(`SELECT id, name, color FROM tags WHERE name = ?`)
      .get(trimmed) as { id: number; name: string; color: string };
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
    this.db
      .getDatabase()
      .prepare(`UPDATE tags SET name = ? WHERE id = ?`)
      .run(trimmed, tagId);
    this.invalidateMetadataCaches();
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .getDatabase()
      .prepare(`UPDATE tags SET color = ? WHERE id = ?`)
      .run(color, tagId);
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
  ): Promise<{ changed: boolean }> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();
    const normalized = path.resolve(folderPath);
    const current = db
      .prepare('SELECT available FROM folders WHERE path = ?')
      .get(normalized) as { available: number } | undefined;
    if (!current) return { changed: false };
    const currentBool = !!current.available;
    if (currentBool === available) return { changed: false };

    const txn = db.transaction(() => {
      db.prepare('UPDATE folders SET available = ? WHERE path = ?').run(
        available ? 1 : 0,
        normalized,
      );
      const pattern = normalized + '/%';
      db.prepare('UPDATE images SET missing = ? WHERE file_path LIKE ?').run(
        available ? 0 : 1,
        pattern,
      );
    });
    txn();

    this.invalidateImageCache();
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
    console.log(`[migration] backfilled EXIF for ${filled}/${rows.length} images${cancelled ? ' (cancelled)' : ''}`);
    return { filled, cancelled };
  }

  // --- Face Detection / People ---

  private async detectFacesForImage(
    imageId: number,
    filePath: string,
  ): Promise<{ count: number; personIds: number[] }> {
    if (!this.db || !this.faceDetector || !this.faceMatcher) {
      throw new Error('Face detection is not available');
    }

    const faces = await this.faceDetector.detectFaces(filePath);
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
    return { count: faces.length, personIds: [...usedPersonIds] };
  }

  async processExistingImagesForFaces(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<FaceScanResult> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.faceDetector || !this.faceMatcher) {
      throw new Error('Face detection is not available. The face-api models may have failed to load.');
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

  async filterImagesByPerson(
    personId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    return this.getPersonImages(personId, limit, offset);
  }

  async deletePerson(personId: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.deletePerson(personId);
  }

  getDatabase(): DatabaseManager | null {
    return this.db;
  }

  async addImage(filePath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');

    const normalizedPath = path.resolve(filePath);
    const fileName = path.basename(filePath);

    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || null;

    const [exifData, fileHash, dhash] = await Promise.all([
      extractExif(filePath),
      computeFileHash(filePath),
      computeDHash(filePath),
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
      dhash: dhash,
    };

    const imageId = this.db.insertImage(imageData);

    try {
      const embedding = await this.embedder.embedImage(filePath);
      this.db.insertEmbedding(imageId, embedding);
    } catch (error) {
      console.error(`Failed to generate embedding for ${filePath}:`, error);
    }

    const folder = this.getFolderForPath(filePath);
    if (!folder?.exclude_from_face_scan) {
      try {
        await this.detectFacesForImage(imageId, filePath);
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

  async computeMissingHashes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<HashScanResult> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const rows = db
      .prepare(
        'SELECT id, file_path FROM images WHERE hidden = 0 AND missing = 0 AND (file_hash IS NULL OR dhash IS NULL)',
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
        const [fileHash, dhash] = await Promise.all([
          computeFileHash(row.file_path),
          computeDHash(row.file_path),
        ]);
        db.prepare('UPDATE images SET file_hash = ?, dhash = ? WHERE id = ?').run(
          fileHash,
          dhash,
          row.id,
        );
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

    const images = db
      .prepare(
        `SELECT id, file_path, file_name, file_size, mime_type, width, height,
                created_at, modified_at, captured_at, latitude, longitude,
                city, country, description, favorite, hidden, file_hash, dhash
         FROM images WHERE hidden = 0 AND missing = 0 AND dhash IS NOT NULL`,
      )
      .all() as Image[];

    // Load dismissed pairs into a set for fast lookup
    const dismissed = db
      .prepare('SELECT image_id_1, image_id_2 FROM dismissed_duplicates')
      .all() as Array<{ image_id_1: number; image_id_2: number }>;
    const dismissedSet = new Set(
      dismissed.map(
        (d) => `${Math.min(d.image_id_1, d.image_id_2)}_${Math.max(d.image_id_1, d.image_id_2)}`,
      ),
    );

    // Union-Find
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: number, b: number) => {
      const ra = find(a),
        rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // Phase 1: exact matches via file_hash
    const hashGroups = new Map<string, number[]>();
    for (const img of images) {
      if (img.file_hash) {
        const group = hashGroups.get(img.file_hash) || [];
        group.push(img.id);
        hashGroups.set(img.file_hash, group);
      }
    }
    for (const [, ids] of hashGroups) {
      if (ids.length > 1) {
        for (let i = 1; i < ids.length; i++) {
          const key = `${Math.min(ids[0], ids[i])}_${Math.max(ids[0], ids[i])}`;
          if (!dismissedSet.has(key)) {
            union(ids[0], ids[i]);
          }
        }
      }
    }

    // Phase 2: visual matches via dHash Hamming distance
    for (let i = 0; i < images.length; i++) {
      for (let j = i + 1; j < images.length; j++) {
        if (!images[i].dhash || !images[j].dhash) continue;
        const key = `${Math.min(images[i].id, images[j].id)}_${Math.max(images[i].id, images[j].id)}`;
        if (dismissedSet.has(key)) continue;

        const dist = hammingDistance(images[i].dhash!, images[j].dhash!);
        if (dist <= DHASH_DUPLICATE_THRESHOLD) {
          union(images[i].id, images[j].id);
        }
      }
    }

    // Collect groups
    const groupMap = new Map<number, Image[]>();
    for (const img of images) {
      const root = find(img.id);
      if (!groupMap.has(root)) groupMap.set(root, []);
      groupMap.get(root)!.push(img);
    }

    // Filter to groups with 2+ members
    const groups: DuplicateGroup[] = [];
    for (const [, groupImages] of groupMap) {
      if (groupImages.length < 2) continue;

      const hashes = groupImages.map((i) => i.file_hash).filter(Boolean);
      const hasExact = new Set(hashes).size < hashes.length;

      groups.push({
        groupId: Math.min(...groupImages.map((i) => i.id)),
        images: groupImages,
        matchType: hasExact ? 'exact' : 'visual',
      });
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
