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
} from 'pipeline';
import {
  Image,
  Tag,
  Folder,
  FolderWithStats,
  SearchResult,
  DuplicateGroup,
  SUPPORTED_IMAGE_EXTENSIONS,
} from 'shared';
import { shell } from 'electron';
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
  private imageCache = new Map<string, Image[]>();

  initialize(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
    this.embedder = new ClipEmbedder();
    this.suggestionEngine = new SuggestionEngine(dbPath);
    this.organizer = new Organizer(dbPath);
  }

  close() {
    this.db?.close();
    this.suggestionEngine?.close();
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const cacheKey = `images:${limit}:${offset}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const stmt = this.db.getDatabase().prepare(`
      SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
      FROM images i
      WHERE i.hidden = 0
      ORDER BY i.captured_at DESC, i.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset) as ImageDbRow[];
    const images: Image[] = rows.map((row) => ({ ...row, embedded: !!row.embedded }));
    for (const image of images) {
      image.tags = this.db.getImageTags(image.id) as Tag[];
    }
    this.imageCache.set(cacheKey, images);
    return images;
  }

  private invalidateImageCache() {
    this.imageCache.clear();
  }

  async getFavoriteImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.getDatabase().prepare(`
      SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
      FROM images i
      WHERE i.favorite = 1 AND i.hidden = 0
      ORDER BY i.captured_at DESC, i.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(limit, offset) as ImageDbRow[];
    const images: Image[] = rows.map((row) => ({ ...row, embedded: !!row.embedded }));
    for (const image of images) {
      image.tags = this.db.getImageTags(image.id) as Tag[];
    }
    return images;
  }

  async getImagesByTags(
    tagNames: string[],
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (tagNames.length === 0) return this.getImages(limit, offset);

    const placeholders = tagNames.map(() => '?').join(',');
    const stmt = this.db.getDatabase().prepare(`
      SELECT i.*, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
      FROM images i
      INNER JOIN image_tags it ON i.id = it.image_id
      INNER JOIN tags t ON it.tag_id = t.id
      WHERE i.hidden = 0 AND t.name IN (${placeholders})
      GROUP BY i.id
      HAVING COUNT(DISTINCT t.id) = ?
      ORDER BY i.captured_at DESC, i.created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...tagNames, tagNames.length, limit, offset) as ImageDbRow[];
    const images: Image[] = rows.map((row) => ({ ...row, embedded: !!row.embedded }));
    for (const image of images) {
      image.tags = this.db.getImageTags(image.id) as Tag[];
    }
    return images;
  }

  async searchImages(query: string, limit: number = 50): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');
    const db = this.db;

    const embedding = await this.embedder.embedText(query);

    const stmt = db.getDatabase().prepare(`
      SELECT sub.rowid, sub.distance
      FROM (
        SELECT v.rowid, v.distance
        FROM vec_images v
        WHERE v.embedding MATCH ? AND k = ?
      ) sub
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0
      ORDER BY sub.distance
    `);
    const results = stmt.all(JSON.stringify(embedding), limit) as Array<{
      rowid: number;
      distance: number;
    }>;

    const imageIds = results.map((r) => r.rowid);
    if (imageIds.length === 0) return [];

    const placeholders = imageIds.map(() => '?').join(',');
    const imageStmt = db.getDatabase().prepare(`
      SELECT * FROM images WHERE id IN (${placeholders})
    `);
    const images = imageStmt.all(...imageIds) as Image[];

    // IN query doesn't preserve order, so re-sort by distance
    const distanceMap = new Map(results.map((r) => [r.rowid, r.distance]));
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
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0
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
    const normalized = path.resolve(folderPath);
    try {
      await fs.access(normalized);
    } catch {
      throw new Error('Folder does not exist');
    }
    const stmt = this.db.getDatabase().prepare(`
      INSERT OR IGNORE INTO folders (path) VALUES (?)
    `);
    const result = stmt.run(normalized);
    this.invalidateImageCache();
    return result.lastInsertRowid as number;
  }

  async scanFolder(folderPath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = path.resolve(folderPath);
    try {
      await fs.access(normalized);
    } catch {
      throw new Error('Folder does not exist');
    }
    const folderId = await this.addFolder(normalized);

    const imageFiles: string[] = [];

    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
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
    for (const file of imageFiles) {
      try {
        await this.addImage(file);
        processed++;
      } catch (error) {
        console.error(`Failed to process ${file}:`, error);
      }
    }

    const stmt = this.db.getDatabase().prepare(`
      UPDATE folders SET last_scanned = datetime('now') WHERE path = ?
    `);
    stmt.run(normalized);

    console.log(`Scan completed: ${processed} images processed`);
    return folderId;
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
        LEFT JOIN images i ON i.file_path LIKE fo.path || '/%' AND i.hidden = 0
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
    const normalized = path.resolve(folderPath);
    this.db.getDatabase().prepare('DELETE FROM folders WHERE path = ?').run(normalized);
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
      const linkTag = db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source) VALUES (?, ?, 'user')`,
      );

      for (const name of tagNames) {
        insertTag.run(name);
        const row = getTagId.get(name) as { id: number } | undefined;
        if (row) {
          linkTag.run(imageId, row.id);
        }
      }
    });
    txn();

    this.invalidateImageCache();
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
      .prepare(`UPDATE images SET hidden = 1, modified_at = datetime('now') WHERE file_path = ?`)
      .run(filePath);
    this.invalidateImageCache();
  }

  async updateImageMetadata(
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
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

    if (fields.length === 0) return;

    fields.push("modified_at = datetime('now')");
    values.push(imageId);

    db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(
      ...(values as (string | number)[]),
    );
    this.invalidateImageCache();
  }

  async getAllTags(): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getAllTags() as Tag[];
  }

  async getSuggestions(imageId: number): Promise<TagSuggestion[]> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    return this.suggestionEngine.generateSuggestionsForImage(imageId);
  }

  async dismissSuggestion(imageId: number, tagId: number): Promise<void> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    this.suggestionEngine.dismissSuggestion(imageId, tagId);
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
  ): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const rows = db
      .prepare(
        'SELECT id, file_path FROM images WHERE hidden = 0 AND (file_hash IS NULL OR dhash IS NULL)',
      )
      .all() as Array<{ id: number; file_path: string }>;

    let computed = 0;
    for (let i = 0; i < rows.length; i++) {
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
    return computed;
  }

  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const images = db
      .prepare(
        `SELECT id, file_path, file_name, file_size, mime_type, width, height,
                created_at, modified_at, captured_at, latitude, longitude,
                city, country, description, favorite, hidden, file_hash, dhash
         FROM images WHERE hidden = 0 AND dhash IS NOT NULL`,
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

    await shell.trashItem(row.file_path);
    db.prepare('DELETE FROM images WHERE id = ?').run(imageId);
    this.invalidateImageCache();
  }
}
