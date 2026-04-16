import { DatabaseManager, ClipEmbedder, SuggestionEngine, Organizer, TagSuggestion, Collection, extractExif } from 'pipeline';
import { Image, Tag, Folder, SearchResult } from 'shared';
import path from 'path';
import fs from 'fs/promises';

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

  // Image operations
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
    const rows = stmt.all(limit, offset) as any[];
    const images: Image[] = rows.map(row => ({ ...row, embedded: !!row.embedded }));
    for (const image of images) {
      image.tags = this.db!.getImageTags(image.id) as Tag[];
    }
    this.imageCache.set(cacheKey, images);
    return images;
  }

  private invalidateImageCache() {
    this.imageCache.clear();
  }

  async getImagesByTags(tagNames: string[], limit: number = 100, offset: number = 0): Promise<Image[]> {
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
    const rows = stmt.all(...tagNames, tagNames.length, limit, offset) as any[];
    const images: Image[] = rows.map(row => ({ ...row, embedded: !!row.embedded }));
    for (const image of images) {
      image.tags = this.db!.getImageTags(image.id) as Tag[];
    }
    return images;
  }

  async searchImages(query: string, limit: number = 50): Promise<SearchResult[]> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');
    
    // Generate embedding for query
    const embedding = await this.embedder.embedText(query);
    
    // Search using vector similarity
    const stmt = this.db.getDatabase().prepare(`
      SELECT sub.rowid, sub.distance
      FROM (
        SELECT v.rowid, v.distance
        FROM vec_images v
        WHERE v.embedding MATCH ? AND k = ?
      ) sub
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0
      ORDER BY sub.distance
    `);
    const results = stmt.all(JSON.stringify(embedding), limit) as Array<{ rowid: number, distance: number }>;
    
    // Get full image details
    const imageIds = results.map(r => r.rowid);
    if (imageIds.length === 0) return [];
    
    const placeholders = imageIds.map(() => '?').join(',');
    const imageStmt = this.db.getDatabase().prepare(`
      SELECT * FROM images WHERE id IN (${placeholders})
    `);
    const images = imageStmt.all(...imageIds) as Image[];
    
    // Map distances
    const distanceMap = new Map(results.map(r => [r.rowid, r.distance]));
    return images.map(img => ({
      ...img,
      distance: distanceMap.get(img.id),
      tags: this.db!.getImageTags(img.id) as Tag[],
    }));
  }

  async addFolder(folderPath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = path.resolve(folderPath);
    // Check if folder exists
    try {
      await fs.access(normalized);
    } catch {
      throw new Error('Folder does not exist');
    }
    const stmt = this.db.getDatabase().prepare(`
      INSERT OR IGNORE INTO folders (path) VALUES (?)
    `);
    const result = stmt.run(normalized);
    // Invalidate image cache because new images may be added
    this.invalidateImageCache();
    return result.lastInsertRowid as number;
  }

  async scanFolder(folderPath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    const normalized = path.resolve(folderPath);
    // Ensure folder exists
    try {
      await fs.access(normalized);
    } catch {
      throw new Error('Folder does not exist');
    }
    // Add folder if not exists
    const folderId = await this.addFolder(normalized);
    
    // Recursively find image files
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.heic']);
    const imageFiles: string[] = [];
    
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (imageExts.has(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    }
    
    console.log(`Scanning folder ${normalized} for images...`);
    await walk(normalized);
    console.log(`Found ${imageFiles.length} image files`);
    
    // Process each image
    let processed = 0;
    for (const file of imageFiles) {
      try {
        await this.addImage(file);
        processed++;
      } catch (error) {
        console.error(`Failed to process ${file}:`, error);
      }
    }
    
    // Update folder's last_scanned timestamp
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

  async updateImageTags(imageId: number, tagNames: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const txn = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE image_id = ? AND source = 'user'`).run(imageId);

      const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name, category) VALUES (?, 'user')`);
      const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const linkTag = db.prepare(`INSERT OR IGNORE INTO image_tags (image_id, tag_id, source) VALUES (?, ?, 'user')`);

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
    this.db.getDatabase().prepare(
      `UPDATE images SET hidden = 1, modified_at = datetime('now') WHERE id = ?`
    ).run(imageId);
    this.invalidateImageCache();
  }

  async markImageMissing(filePath: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    this.db.getDatabase().prepare(
      `UPDATE images SET hidden = 1, modified_at = datetime('now') WHERE file_path = ?`
    ).run(filePath);
    this.invalidateImageCache();
  }

  async updateImageMetadata(imageId: number, metadata: {
    description?: string;
    favorite?: boolean;
    captured_at?: string | null;
    city?: string | null;
    country?: string | null;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const db = this.db.getDatabase();

    const fields: string[] = [];
    const values: any[] = [];

    if (metadata.description !== undefined) { fields.push('description = ?'); values.push(metadata.description); }
    if (metadata.favorite !== undefined) { fields.push('favorite = ?'); values.push(metadata.favorite ? 1 : 0); }
    if (metadata.captured_at !== undefined) { fields.push('captured_at = ?'); values.push(metadata.captured_at); }
    if (metadata.city !== undefined) { fields.push('city = ?'); values.push(metadata.city); }
    if (metadata.country !== undefined) { fields.push('country = ?'); values.push(metadata.country); }

    if (fields.length === 0) return;

    fields.push("modified_at = datetime('now')");
    values.push(imageId);

    db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    this.invalidateImageCache();
  }

  // Tags
  async getAllTags(): Promise<Tag[]> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.getAllTags() as Tag[];
  }

  // Suggestions
  async getSuggestions(imageId: number): Promise<TagSuggestion[]> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    return this.suggestionEngine.generateSuggestionsForImage(imageId);
  }

  async dismissSuggestion(imageId: number, tagId: number): Promise<void> {
    if (!this.suggestionEngine) throw new Error('Suggestion engine not initialized');
    this.suggestionEngine.dismissSuggestion(imageId, tagId);
  }

  // Collections
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
    if (version >= 1) return; // already migrated

    console.log('[migration] fixing image dimensions for EXIF rotation...');
    const rows = db.prepare('SELECT id, file_path, width, height FROM images').all() as Array<{ id: number; file_path: string; width: number | null; height: number | null }>;
    let fixed = 0;
    for (const row of rows) {
      try {
        const exif = await extractExif(row.file_path);
        if (exif.width !== row.width || exif.height !== row.height) {
          db.prepare('UPDATE images SET width = ?, height = ? WHERE id = ?').run(exif.width, exif.height, row.id);
          fixed++;
        }
      } catch {}
    }
    db.pragma(`user_version = 1`);
    this.invalidateImageCache();
    console.log(`[migration] fixed dimensions for ${fixed}/${rows.length} images`);
  }

  // Helper to get database instance (for watcher)
  getDatabase(): DatabaseManager | null {
    return this.db;
  }

  // Process an image file and add to database
  async addImage(filePath: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    if (!this.embedder) throw new Error('Embedder not initialized');

    const normalizedPath = path.resolve(filePath);
    const fileName = path.basename(filePath);
    
    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Determine MIME type based on extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.tiff': 'image/tiff',
      '.heic': 'image/heic',
    }[ext] || null;
    
    // Extract EXIF metadata
    const exifData = await extractExif(filePath);
    
    // Prepare image object for insertion (excluding id, created_at, modified_at)
    const imageData: Omit<Image, 'id' | 'created_at' | 'modified_at'> = {
      file_path: normalizedPath,
      file_name: fileName,
      file_size: fileSize,
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
    };
    
    // Insert image into database
    const imageId = this.db.insertImage(imageData);
    
    // Generate embedding and insert into vector table
    try {
      const embedding = await this.embedder.embedImage(filePath);
      this.db.insertEmbedding(imageId, embedding);
    } catch (error) {
      console.error(`Failed to generate embedding for ${filePath}:`, error);
      // Continue without embedding
    }
    
    // Invalidate cache since new image added
    this.invalidateImageCache();

    console.log(`Added image ${imageId}: ${filePath}`);
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
}