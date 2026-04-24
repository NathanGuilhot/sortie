import Database from 'better-sqlite3';
import path from 'path';
import {
  Collection,
  Image,
  Face,
  Person,
  Folder,
  FolderWithStats,
  LinkPreview,
  PaletteColor,
  Tag,
  parseOptionalJson,
  normalizeVector,
  type AppSettingKey,
  type OcrStatus,
} from 'shared';
import { decodeEmbeddingRows, decodeEmbeddingValue, type EmbeddingRowValue } from './embedding';
import { extractExif } from './exif';
import { runDatabaseMigrations } from './db-migrations';
import { setupDatabaseSchema } from './db-schema';

interface EmbeddingDbRow extends EmbeddingRowValue {
  rowid: number;
}

interface TagDbRow {
  id: number;
  name: string;
  category: string;
  color: string;
  created_at: string;
}

interface DismissedDbRow {
  image_id: number;
  tag_id: number;
  dismissed_at: string;
}

interface VecMatchRow {
  rowid: number;
  distance: number;
}

interface ImageDbRow extends Omit<Image, 'embedded' | 'palette' | 'tags'> {
  palette_json: string | null;
  embedded: number;
}

const IMAGE_DIMENSIONS_MIGRATION_KEY = 'migration:image-dimensions-fixed';

export class DatabaseManager {
  private db: Database.Database;
  private vecLoaded = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.setupExtensions();
    this.setupSchema();
    this.runMigrations();
  }

  private setupPragmas() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  private setupExtensions() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getLoadablePath } = require('sqlite-vec') as { getLoadablePath: () => string };
      let extPath = getLoadablePath();
      // In packaged Electron apps, sqlite-vec resolves to a path inside
      // app.asar but the .dylib lives in app.asar.unpacked (per electron-builder
      // asarUnpack rules). Redirect so sqlite3_load_extension can dlopen it.
      extPath = extPath.replace(
        `${path.sep}app.asar${path.sep}`,
        `${path.sep}app.asar.unpacked${path.sep}`,
      );
      this.db.loadExtension(extPath);
      this.vecLoaded = true;
    } catch (err) {
      console.warn('sqlite-vec extension not available:', err);
    }
  }

  private setupSchema() {
    setupDatabaseSchema(this.db, this.vecLoaded);
  }

  private runMigrations() {
    runDatabaseMigrations(this.db, this.vecLoaded);
  }

  upsertImage(image: Omit<Image, 'id' | 'created_at' | 'modified_at'>): {
    id: number;
    created: boolean;
    fileHashMatched: boolean;
  } {
    const existing = this.db
      .prepare('SELECT id, file_hash, file_size FROM images WHERE file_path = ?')
      .get(image.file_path) as { id: number; file_hash: string | null; file_size: number | null } | undefined;

    if (existing) {
      const fileHashMatched =
        image.file_hash != null &&
        existing.file_hash === image.file_hash &&
        existing.file_size === image.file_size;

      this.db
        .prepare(
          `UPDATE images SET
             file_name = ?,
             file_size = ?,
             mime_type = ?,
             width = ?,
             height = ?,
             captured_at = ?,
             latitude = ?,
             longitude = ?,
             file_hash = ?,
             dhash = COALESCE(?, dhash),
             camera_make = ?,
             camera_model = ?,
             aperture = ?,
             iso = ?,
             exposure_time = ?,
             focal_length = ?,
             missing = 0,
             modified_at = datetime('now')
           WHERE id = ?`,
        )
        .run(
          image.file_name,
          image.file_size,
          image.mime_type,
          image.width,
          image.height,
          image.captured_at,
          image.latitude,
          image.longitude,
          image.file_hash ?? null,
          image.dhash ?? null,
          image.camera_make ?? null,
          image.camera_model ?? null,
          image.aperture ?? null,
          image.iso ?? null,
          image.exposure_time ?? null,
          image.focal_length ?? null,
          existing.id,
        );
      return { id: existing.id, created: false, fileHashMatched };
    }

    const result = this.db
      .prepare(
        `INSERT INTO images (
           file_path, file_name, file_size, mime_type, width, height,
           captured_at, latitude, longitude, city, country, description,
           favorite, hidden, file_hash, dhash,
           camera_make, camera_model, aperture, iso, exposure_time, focal_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        image.file_path,
        image.file_name,
        image.file_size,
        image.mime_type,
        image.width,
        image.height,
        image.captured_at,
        image.latitude,
        image.longitude,
        image.city,
        image.country,
        image.description,
        image.favorite ? 1 : 0,
        image.hidden ? 1 : 0,
        image.file_hash ?? null,
        image.dhash ?? null,
        image.camera_make ?? null,
        image.camera_model ?? null,
        image.aperture ?? null,
        image.iso ?? null,
        image.exposure_time ?? null,
        image.focal_length ?? null,
      );
    return { id: result.lastInsertRowid as number, created: true, fileHashMatched: false };
  }

  insertEmbedding(rowid: number, embedding: number[]) {
    // vec0 tables don't support REPLACE; delete then insert.
    this.db.prepare('DELETE FROM vec_images WHERE rowid = ?').run(BigInt(rowid));
    this.db
      .prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(rowid), new Float32Array(embedding));
  }

  insertPalette(imageId: number, palette: PaletteColor[]): void {
    const txn = this.db.transaction((pal: PaletteColor[]) => {
      // Clear any previous palette for this image.
      const oldIds = this.db
        .prepare('SELECT id FROM palette_colors WHERE image_id = ?')
        .all(imageId) as Array<{ id: number }>;
      if (this.vecLoaded) {
        const delVec = this.db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        for (const { id } of oldIds) {
          delVec.run(BigInt(id));
        }
      }
      this.db.prepare('DELETE FROM palette_colors WHERE image_id = ?').run(imageId);

      const insertMeta = this.db.prepare(
        'INSERT INTO palette_colors (image_id, color_idx, weight) VALUES (?, ?, ?)',
      );
      const insertVec = this.vecLoaded
        ? this.db.prepare('INSERT INTO vec_palette (rowid, lab) VALUES (?, ?)')
        : null;

      for (let i = 0; i < pal.length; i++) {
        const color = pal[i];
        const result = insertMeta.run(imageId, i, color.weight);
        const rowid = result.lastInsertRowid as number;
        if (insertVec) {
          insertVec.run(BigInt(rowid), new Float32Array(color.lab));
        }
      }

      this.db
        .prepare('UPDATE images SET palette_json = ? WHERE id = ?')
        .run(JSON.stringify(pal), imageId);
    });
    txn(palette);
  }

  getPalette(imageId: number): PaletteColor[] | null {
    const row = this.db.prepare('SELECT palette_json FROM images WHERE id = ?').get(imageId) as
      | { palette_json: string | null }
      | undefined;
    return parseOptionalJson<PaletteColor[]>(row?.palette_json);
  }

  getImagesMissingPalette(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM images
         WHERE palette_json IS NULL AND hidden = 0 AND missing = 0`,
      )
      .all() as Array<{ id: number; file_path: string }>;
  }

  getVisibleImageIds(): number[] {
    const rows = this.db
      .prepare('SELECT id FROM images WHERE hidden = 0 AND missing = 0')
      .all() as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getImagesByIds(ids: number[]): Image[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT i.*, i.palette_json, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
         FROM images i
         WHERE i.id IN (${placeholders})`,
      )
      .all(...ids) as ImageDbRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));

    const images: Image[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      const { palette_json: paletteJson, embedded, ...rest } = row;

      images.push({
        ...rest,
        embedded: !!embedded,
        palette: parseOptionalJson<PaletteColor[]>(paletteJson),
        tags: this.getImageTags(id) as Tag[],
      });
    }

    return images;
  }

  getImageById(imageId: number): Image | null {
    const row = this.db
      .prepare(
        `SELECT i.*, i.palette_json, (i.id IN (SELECT rowid FROM vec_images)) AS embedded
         FROM images i
         WHERE i.id = ?`,
      )
      .get(imageId) as ImageDbRow | undefined;
    if (!row) return null;
    const { palette_json: paletteJson, embedded, ...rest } = row;

    return {
      ...rest,
      embedded: !!embedded,
      palette: parseOptionalJson<PaletteColor[]>(paletteJson),
      tags: this.getImageTags(imageId) as Tag[],
    };
  }

  /**
   * Given a set of query colors in Lab space, return the N nearest images.
   * For each image, we take the minimum distance to any of its palette
   * colors per query, then aggregate per image by summing those minima
   * (so "red + blue" favors images that contain both red AND blue).
   */
  findImagesByColors(
    queryLabs: Array<[number, number, number]>,
    limit: number,
  ): Array<{ imageId: number; score: number }> {
    if (!this.vecLoaded || queryLabs.length === 0) return [];

    // Oversample per query to give the aggregator enough candidates.
    const perQueryK = Math.max(200, limit * 10);

    const perImageMin = new Map<number, number[]>();
    const queryDist = this.db.prepare(`
      SELECT v.rowid, v.distance, pc.image_id
      FROM vec_palette v
      JOIN palette_colors pc ON pc.id = v.rowid
      JOIN images i ON i.id = pc.image_id
      WHERE v.lab MATCH ? AND k = ? AND i.hidden = 0 AND i.missing = 0
      ORDER BY v.distance
    `);

    for (let qi = 0; qi < queryLabs.length; qi++) {
      const rows = queryDist.all(new Float32Array(queryLabs[qi]), perQueryK) as Array<{
        rowid: number;
        distance: number;
        image_id: number;
      }>;

      const seen = new Set<number>();
      for (const r of rows) {
        if (seen.has(r.image_id)) continue;
        seen.add(r.image_id);
        let arr = perImageMin.get(r.image_id);
        if (!arr) {
          arr = new Array(queryLabs.length).fill(Infinity);
          perImageMin.set(r.image_id, arr);
        }
        arr[qi] = r.distance;
      }
    }

    const aggregated: Array<{ imageId: number; score: number }> = [];
    for (const [imageId, dists] of perImageMin) {
      // Only keep images that matched every requested color (otherwise
      // searching for red + blue returns images with only red).
      let score = 0;
      let complete = true;
      for (const d of dists) {
        if (!Number.isFinite(d)) {
          complete = false;
          break;
        }
        score += d;
      }
      if (complete) aggregated.push({ imageId, score });
    }
    aggregated.sort((a, b) => a.score - b.score);
    return aggregated.slice(0, limit);
  }

  close() {
    this.db.close();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  getSetting(key: AppSettingKey): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: AppSettingKey, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(key, value);
  }

  async runStartupMaintenance(): Promise<{ fixedImageDimensions: number }> {
    const alreadyRan = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(IMAGE_DIMENSIONS_MIGRATION_KEY) as { value: string } | undefined;
    if (alreadyRan?.value === '1') {
      return { fixedImageDimensions: 0 };
    }

    const rows = this.db
      .prepare('SELECT id, file_path, width, height FROM images')
      .all() as Array<{
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
          this.db.prepare('UPDATE images SET width = ?, height = ? WHERE id = ?').run(
            exif.width,
            exif.height,
            row.id,
          );
          fixed += 1;
        }
      } catch (error) {
        console.warn(`Failed to fix dimensions for ${row.file_path}:`, error);
      }
    }

    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(IMAGE_DIMENSIONS_MIGRATION_KEY, '1');
    return { fixedImageDimensions: fixed };
  }

  getAllEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return decodeEmbeddingRows(
      this.db.prepare('SELECT rowid, embedding FROM vec_images').all() as EmbeddingDbRow[],
    );
  }

  getVisibleEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return decodeEmbeddingRows(
      this.db
        .prepare(
          `SELECT v.rowid AS rowid, v.embedding AS embedding
           FROM vec_images v
           JOIN images img ON img.id = v.rowid
           WHERE img.hidden = 0 AND img.missing = 0`,
        )
        .all() as EmbeddingDbRow[],
    );
  }

  getEmbedding(imageId: number): number[] | null {
    const row = this.db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as
      | { embedding: EmbeddingDbRow['embedding'] }
      | undefined;
    if (!row) return null;
    return decodeEmbeddingValue(row.embedding);
  }

  getImageTags(imageId: number): TagDbRow[] {
    return this.db
      .prepare(
        `
      SELECT t.* FROM tags t
      JOIN image_tags it ON t.id = it.tag_id
      WHERE it.image_id = ?
    `,
      )
      .all(imageId) as TagDbRow[];
  }

  getDismissedSuggestions(imageId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE image_id = ?')
      .all(imageId) as DismissedDbRow[];
  }

  getDismissedSuggestionsByTag(tagId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE tag_id = ?')
      .all(tagId) as DismissedDbRow[];
  }

  getBoardImageIds(tagId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT it.image_id AS image_id
         FROM image_tags it
         INNER JOIN images img ON img.id = it.image_id
         WHERE it.tag_id = ? AND img.hidden = 0 AND img.missing = 0`,
      )
      .all(tagId) as Array<{ image_id: number }>;
    return rows.map((r) => r.image_id);
  }

  dismissSuggestion(imageId: number, tagId: number): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO dismissed_suggestions (image_id, tag_id)
      VALUES (?, ?)
    `,
      )
      .run(imageId, tagId);
  }

  getAllTags(): TagDbRow[] {
    return this.db.prepare('SELECT * FROM tags').all() as TagDbRow[];
  }

  getTagsWithCounts(): Array<TagDbRow & { usage_count: number }> {
    return this.db
      .prepare(
        `
      SELECT t.*, COUNT(it.image_id) AS usage_count
      FROM tags t
      LEFT JOIN image_tags it ON t.id = it.tag_id
      GROUP BY t.id
      ORDER BY usage_count DESC
    `,
      )
      .all() as Array<TagDbRow & { usage_count: number }>;
  }

  renameTag(tagId: number, name: string): void {
    this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, tagId);
  }

  setTagColor(tagId: number, color: string): void {
    this.db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, tagId);
  }

  deleteTag(tagId: number): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
  }

  createCollection(name: string, description: string | null, clusterId: number | null): number {
    const result = this.db
      .prepare('INSERT INTO collections (name, description, cluster_id) VALUES (?, ?, ?)')
      .run(name, description, clusterId);
    return result.lastInsertRowid as number;
  }

  addImagesToCollection(collectionId: number, imageIds: number[]): void {
    const insertImage = this.db.prepare(
      'INSERT OR IGNORE INTO collection_images (collection_id, image_id) VALUES (?, ?)',
    );
    const txn = this.db.transaction((ids: number[]) => {
      for (const imageId of ids) {
        insertImage.run(collectionId, imageId);
      }
    });
    txn(imageIds);
  }

  getCollections(): Collection[] {
    return this.db
      .prepare('SELECT * FROM collections ORDER BY created_at DESC')
      .all() as Collection[];
  }

  // --- Face / Person methods ---

  insertFace(face: {
    image_id: number;
    person_id: number | null;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    confidence: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO faces (image_id, person_id, bbox_x, bbox_y, bbox_w, bbox_h, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      face.image_id,
      face.person_id,
      face.bbox_x,
      face.bbox_y,
      face.bbox_w,
      face.bbox_h,
      face.confidence,
    );
    return result.lastInsertRowid as number;
  }

  insertFaceEmbedding(faceRowid: number, embedding: number[]): void {
    this.db
      .prepare('INSERT OR REPLACE INTO vec_faces (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(faceRowid), new Float32Array(normalizeVector(embedding)));
  }

  getFaceEmbedding(faceId: number): number[] | null {
    const row = this.db
      .prepare('SELECT embedding FROM vec_faces WHERE rowid = ?')
      .get(BigInt(faceId)) as { embedding: Buffer | number[] } | undefined;
    if (!row) return null;
    return decodeEmbeddingValue(row.embedding);
  }

  insertPerson(name?: string | null): number {
    const stmt = this.db.prepare('INSERT INTO persons (name) VALUES (?)');
    const result = stmt.run(name ?? null);
    return result.lastInsertRowid as number;
  }

  insertPersonEmbedding(personRowid: number, embedding: number[]): void {
    // vec0 virtual tables don't support REPLACE — delete first, then insert.
    this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?').run(BigInt(personRowid));
    this.db
      .prepare('INSERT INTO vec_persons (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(personRowid), new Float32Array(normalizeVector(embedding)));
  }

  findNearestPerson(embedding: number[], limit: number = 1): VecMatchRow[] {
    const stmt = this.db.prepare(`
      SELECT rowid, distance FROM vec_persons
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `);
    return stmt.all(new Float32Array(embedding), limit) as VecMatchRow[];
  }

  getAllPersons(): Person[] {
    return this.db
      .prepare('SELECT * FROM persons WHERE face_count > 0 ORDER BY face_count DESC')
      .all() as Person[];
  }

  getPersonImageIds(personId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT i.id AS id
         FROM images i
         JOIN faces f ON f.image_id = i.id
         WHERE f.person_id = ? AND i.hidden = 0 AND i.missing = 0`,
      )
      .all(personId) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getThumbnailFacesForPersons(personIds: number[]): Face[] {
    if (personIds.length === 0) return [];

    const placeholders = personIds.map(() => '?').join(',');
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         JOIN persons p ON p.thumbnail_face_id = f.id
         JOIN images i ON i.id = f.image_id
         WHERE p.id IN (${placeholders})`,
      )
      .all(...personIds) as Face[];
  }

  getPersonById(personId: number): Person | null {
    return (
      (this.db.prepare('SELECT * FROM persons WHERE id = ?').get(personId) as Person | undefined) ??
      null
    );
  }

  getImageFaces(imageId: number): Face[] {
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         LEFT JOIN persons p ON f.person_id = p.id
         LEFT JOIN images i ON f.image_id = i.id
         WHERE f.image_id = ?`,
      )
      .all(imageId) as Face[];
  }

  getPersonFaces(personId: number): Face[] {
    return this.db
      .prepare(
        `SELECT f.*, p.name AS person_name, i.file_path AS image_path
         FROM faces f
         LEFT JOIN persons p ON f.person_id = p.id
         LEFT JOIN images i ON f.image_id = i.id
         WHERE f.person_id = ?`,
      )
      .all(personId) as Face[];
  }

  updateFacePerson(faceId: number, personId: number | null): void {
    this.db.prepare('UPDATE faces SET person_id = ? WHERE id = ?').run(personId, faceId);
  }

  getFacePersonId(faceId: number): number | null {
    const row = this.db.prepare('SELECT person_id FROM faces WHERE id = ?').get(faceId) as
      | { person_id: number | null }
      | undefined;
    return row?.person_id ?? null;
  }

  updatePersonName(personId: number, name: string): void {
    this.db
      .prepare("UPDATE persons SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name, personId);
  }

  updatePersonThumbnail(personId: number, faceId: number): void {
    this.db
      .prepare(
        "UPDATE persons SET thumbnail_face_id = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(faceId, personId);
  }

  updatePersonFaceCount(personId: number): void {
    this.db
      .prepare(
        `UPDATE persons SET
           face_count = (SELECT COUNT(*) FROM faces WHERE person_id = ?),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(personId, personId);
  }

  deletePerson(personId: number): void {
    this.db.prepare('UPDATE faces SET person_id = NULL WHERE person_id = ?').run(personId);
    if (this.vecLoaded) {
      this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?').run(BigInt(personId));
    }
    this.db.prepare('DELETE FROM persons WHERE id = ?').run(personId);
  }

  markImageFacesScanned(imageId: number): void {
    this.db.prepare('UPDATE images SET faces_scanned = 1 WHERE id = ?').run(imageId);
  }

  getUnscannedFaceImages(): Array<{ id: number; file_path: string }> {
    const excluded = this.db
      .prepare('SELECT path FROM folders WHERE exclude_from_face_scan = 1')
      .all() as Array<{ path: string }>;
    if (excluded.length === 0) {
      return this.db
        .prepare('SELECT id, file_path FROM images WHERE faces_scanned = 0 AND hidden = 0')
        .all() as Array<{ id: number; file_path: string }>;
    }
    const likeClauses = excluded.map(() => "file_path NOT LIKE ? || '/%'").join(' AND ');
    const stmt = this.db.prepare(
      `SELECT id, file_path FROM images
       WHERE faces_scanned = 0 AND hidden = 0 AND ${likeClauses}`,
    );
    return stmt.all(...excluded.map((e) => e.path)) as Array<{ id: number; file_path: string }>;
  }

  // --- OCR methods ---

  getImagePath(imageId: number): string | null {
    const row = this.db
      .prepare('SELECT file_path FROM images WHERE id = ?')
      .get(imageId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  getOcrStatus(imageId: number): { status: OcrStatus; at: number | null } {
    const row = this.db
      .prepare('SELECT ocr_status AS status, ocr_at AS at FROM images WHERE id = ?')
      .get(imageId) as { status: OcrStatus; at: number | null } | undefined;
    return row ?? { status: null, at: null };
  }

  getImageOcr(imageId: number): Array<{
    block_index: number;
    text: string;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    polygon_json: string | null;
    confidence: number;
  }> {
    return this.db
      .prepare(
        `SELECT block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence
         FROM image_ocr
         WHERE image_id = ?
         ORDER BY block_index`,
      )
      .all(imageId) as Array<{
      block_index: number;
      text: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      polygon_json: string | null;
      confidence: number;
    }>;
  }

  saveImageOcr(
    imageId: number,
    blocks: Array<{
      text: string;
      bbox: { x: number; y: number; width: number; height: number };
      polygon?: [[number, number], [number, number], [number, number], [number, number]];
      confidence: number;
    }>,
  ): void {
    const now = Date.now();
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM image_ocr WHERE image_id = ?').run(imageId);
      const insert = this.db.prepare(
        `INSERT INTO image_ocr
           (image_id, block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        insert.run(
          imageId,
          i,
          b.text,
          b.bbox.x,
          b.bbox.y,
          b.bbox.width,
          b.bbox.height,
          b.polygon ? JSON.stringify(b.polygon) : null,
          b.confidence,
        );
      }
      this.db
        .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
        .run(blocks.length === 0 ? 'empty' : 'done', now, imageId);
    });
    txn();
  }

  markOcrError(imageId: number, message: string): void {
    // Truncate to avoid storing multi-kilobyte stack traces as status rows.
    const short = message.length > 200 ? message.slice(0, 200) : message;
    this.db
      .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
      .run(`error:${short}`, Date.now(), imageId);
  }

  cleanupOrphanedPersons(): void {
    const orphans = this.db
      .prepare(
        `SELECT id FROM persons
         WHERE id NOT IN (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)`,
      )
      .all() as Array<{ id: number }>;
    const delVec = this.vecLoaded
      ? this.db.prepare('DELETE FROM vec_persons WHERE rowid = ?')
      : null;
    const delPerson = this.db.prepare('DELETE FROM persons WHERE id = ?');
    for (const { id } of orphans) {
      delVec?.run(BigInt(id));
      delPerson.run(id);
    }
  }

  listFolders(): Folder[] {
    return this.db.prepare('SELECT * FROM folders ORDER BY created_at DESC').all() as Folder[];
  }

  listFoldersWithStats(): FolderWithStats[] {
    const rows = this.db
      .prepare(
        `SELECT f.*,
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
         ORDER BY f.created_at DESC`,
      )
      .all() as Array<Folder & { image_count: number; total_size: number }>;

    return rows.map((row) => ({
      ...row,
      folder_name: path.basename(row.path) || row.path,
    }));
  }

  findFolderForPath(filePath: string): Folder | null {
    return (
      (this.db
        .prepare(
          `SELECT * FROM folders
           WHERE ? LIKE path || '/%' OR ? = path
           ORDER BY length(path) DESC
           LIMIT 1`,
        )
        .get(filePath, filePath) as Folder | undefined) ?? null
    );
  }

  getFolderAvailabilityState(
    folderPath: string,
  ): { available: boolean; writable: boolean } | null {
    const row = this.db
      .prepare('SELECT available, writable FROM folders WHERE path = ?')
      .get(folderPath) as { available: number; writable: number } | undefined;
    if (!row) return null;
    return { available: !!row.available, writable: !!row.writable };
  }

  updateFolderAvailabilityState(folderPath: string, available: boolean, writable: boolean): void {
    this.db
      .prepare('UPDATE folders SET available = ?, writable = ? WHERE path = ?')
      .run(available ? 1 : 0, writable ? 1 : 0, folderPath);
  }

  getFolderFaceScanExclusion(folderPath: string): boolean | null {
    const row = this.db
      .prepare('SELECT exclude_from_face_scan FROM folders WHERE path = ?')
      .get(folderPath) as { exclude_from_face_scan: number } | undefined;
    return row ? !!row.exclude_from_face_scan : null;
  }

  setFolderFaceScanExclusionFlag(folderPath: string, excluded: boolean): void {
    this.db
      .prepare('UPDATE folders SET exclude_from_face_scan = ? WHERE path = ?')
      .run(excluded ? 1 : 0, folderPath);
  }

  clearMissingByPathPrefix(pathPrefix: string): void {
    this.db.prepare('UPDATE images SET missing = 0 WHERE file_path LIKE ?').run(pathPrefix);
  }

  markMissingByPathPrefix(pathPrefix: string, excludedFolderPath: string): void {
    this.db
      .prepare(
        `UPDATE images SET missing = 1
         WHERE file_path LIKE ? AND NOT EXISTS (
           SELECT 1 FROM folders f
           WHERE f.path != ?
             AND f.available = 1
             AND (
               images.file_path = f.path
               OR images.file_path LIKE f.path || '/%'
             )
         )`,
      )
      .run(pathPrefix, excludedFolderPath);
  }

  deleteFacesByImagePathPrefix(pathPrefix: string): void {
    this.db
      .prepare(
        `DELETE FROM faces WHERE image_id IN (
           SELECT id FROM images WHERE file_path LIKE ?
         )`,
      )
      .run(pathPrefix);
  }

  markFacesUnscannedByPathPrefix(pathPrefix: string): void {
    this.db.prepare('UPDATE images SET faces_scanned = 0 WHERE file_path LIKE ?').run(pathPrefix);
  }

  setImageHidden(imageId: number): void {
    this.db
      .prepare("UPDATE images SET hidden = 1, modified_at = datetime('now') WHERE id = ?")
      .run(imageId);
  }

  setImageMissingByPath(filePath: string): void {
    this.db
      .prepare("UPDATE images SET missing = 1, modified_at = datetime('now') WHERE file_path = ?")
      .run(filePath);
  }

  updateImageMetadata(
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
      website_link?: string | null;
    },
  ): void {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

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
    this.db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  getLinkPreview(urlHash: string): LinkPreview | null {
    return (
      (this.db
        .prepare(
          'SELECT url, title, description, site_name, image_path, fetched_at, error FROM link_previews WHERE url_hash = ?',
        )
        .get(urlHash) as LinkPreview | undefined) ?? null
    );
  }

  saveLinkPreview(urlHash: string, preview: LinkPreview): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO link_previews
          (url_hash, url, title, description, site_name, image_path, fetched_at, error)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        urlHash,
        preview.url,
        preview.title,
        preview.description,
        preview.site_name,
        preview.image_path,
        preview.fetched_at,
        preview.error,
      );
  }

  getImagesMissingFileHash(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare('SELECT id, file_path FROM images WHERE hidden = 0 AND missing = 0 AND file_hash IS NULL')
      .all() as Array<{ id: number; file_path: string }>;
  }

  updateImageFileHash(imageId: number, fileHash: string): void {
    this.db.prepare('UPDATE images SET file_hash = ? WHERE id = ?').run(fileHash, imageId);
  }

  getVisibleImagesForDuplicates(): Image[] {
    return this.db
      .prepare(
        `SELECT id, file_path, file_name, file_size, mime_type, width, height,
                created_at, modified_at, captured_at, latitude, longitude,
                city, country, description, favorite, hidden, missing, file_hash
         FROM images
         WHERE hidden = 0 AND missing = 0`,
      )
      .all() as Image[];
  }

  findNearestImageMatches(embedding: number[], limit: number): VecMatchRow[] {
    return this.db
      .prepare(
        `SELECT rowid, distance FROM vec_images
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(new Float32Array(embedding), limit) as VecMatchRow[];
  }

  getDismissedDuplicatePairs(): Array<{ image_id_1: number; image_id_2: number }> {
    return this.db
      .prepare('SELECT image_id_1, image_id_2 FROM dismissed_duplicates')
      .all() as Array<{ image_id_1: number; image_id_2: number }>;
  }

  dismissDuplicatePair(imageId1: number, imageId2: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO dismissed_duplicates (image_id_1, image_id_2) VALUES (?, ?)')
      .run(imageId1, imageId2);
  }

  deleteImageRecord(imageId: number): void {
    this.db.prepare('DELETE FROM images WHERE id = ?').run(imageId);
  }
}
