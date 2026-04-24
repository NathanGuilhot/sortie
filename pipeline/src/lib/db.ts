import Database from 'better-sqlite3';
import path from 'path';
import {
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
import { DatabaseFolderRepository } from './db-folders';
import { runDatabaseMigrations } from './db-migrations';
import { DatabaseOcrRepository } from './db-ocr';
import { DatabasePeopleRepository, type VecMatchRow } from './db-people';
import { setupDatabaseSchema } from './db-schema';
import { DatabaseTagRepository, type DismissedDbRow, type TagDbRow } from './db-tags';

interface EmbeddingDbRow extends EmbeddingRowValue {
  rowid: number;
}

interface ImageDbRow extends Omit<Image, 'embedded' | 'palette' | 'tags'> {
  palette_json: string | null;
  embedded: number;
}

const IMAGE_DIMENSIONS_MIGRATION_KEY = 'migration:image-dimensions-fixed';

export class DatabaseManager {
  private db: Database.Database;
  private vecLoaded = false;
  private readonly tags: DatabaseTagRepository;
  private readonly people: DatabasePeopleRepository;
  private readonly ocr: DatabaseOcrRepository;
  private readonly folders: DatabaseFolderRepository;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.setupExtensions();
    this.setupSchema();
    this.runMigrations();
    this.tags = new DatabaseTagRepository(this.db);
    this.people = new DatabasePeopleRepository(this.db, this.vecLoaded);
    this.ocr = new DatabaseOcrRepository(this.db);
    this.folders = new DatabaseFolderRepository(this.db);
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
    return this.tags.getImageTags(imageId);
  }

  getDismissedSuggestions(imageId: number): DismissedDbRow[] {
    return this.tags.getDismissedSuggestions(imageId);
  }

  getDismissedSuggestionsByTag(tagId: number): DismissedDbRow[] {
    return this.tags.getDismissedSuggestionsByTag(tagId);
  }

  getBoardImageIds(tagId: number): number[] {
    return this.tags.getBoardImageIds(tagId);
  }

  dismissSuggestion(imageId: number, tagId: number): void {
    this.tags.dismissSuggestion(imageId, tagId);
  }

  getAllTags(): TagDbRow[] {
    return this.tags.getAllTags();
  }

  getTagsWithCounts(): Array<TagDbRow & { usage_count: number }> {
    return this.tags.getTagsWithCounts();
  }

  renameTag(tagId: number, name: string): void {
    this.tags.renameTag(tagId, name);
  }

  setTagColor(tagId: number, color: string): void {
    this.tags.setTagColor(tagId, color);
  }

  deleteTag(tagId: number): void {
    this.tags.deleteTag(tagId);
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
    return this.people.insertFace(face);
  }

  insertFaceEmbedding(faceRowid: number, embedding: number[]): void {
    this.people.insertFaceEmbedding(faceRowid, embedding);
  }

  getFaceEmbedding(faceId: number): number[] | null {
    return this.people.getFaceEmbedding(faceId);
  }

  insertPerson(name?: string | null): number {
    return this.people.insertPerson(name);
  }

  insertPersonEmbedding(personRowid: number, embedding: number[]): void {
    this.people.insertPersonEmbedding(personRowid, embedding);
  }

  findNearestPerson(embedding: number[], limit: number = 1): VecMatchRow[] {
    return this.people.findNearestPerson(embedding, limit);
  }

  getAllPersons(): Person[] {
    return this.people.getAllPersons();
  }

  getPersonImageIds(personId: number): number[] {
    return this.people.getPersonImageIds(personId);
  }

  getThumbnailFacesForPersons(personIds: number[]): Face[] {
    return this.people.getThumbnailFacesForPersons(personIds);
  }

  getPersonById(personId: number): Person | null {
    return this.people.getPersonById(personId);
  }

  getImageFaces(imageId: number): Face[] {
    return this.people.getImageFaces(imageId);
  }

  getPersonFaces(personId: number): Face[] {
    return this.people.getPersonFaces(personId);
  }

  updateFacePerson(faceId: number, personId: number | null): void {
    this.people.updateFacePerson(faceId, personId);
  }

  getFacePersonId(faceId: number): number | null {
    return this.people.getFacePersonId(faceId);
  }

  updatePersonName(personId: number, name: string): void {
    this.people.updatePersonName(personId, name);
  }

  updatePersonThumbnail(personId: number, faceId: number): void {
    this.people.updatePersonThumbnail(personId, faceId);
  }

  updatePersonFaceCount(personId: number): void {
    this.people.updatePersonFaceCount(personId);
  }

  deletePerson(personId: number): void {
    this.people.deletePerson(personId);
  }

  markImageFacesScanned(imageId: number): void {
    this.people.markImageFacesScanned(imageId);
  }

  getUnscannedFaceImages(): Array<{ id: number; file_path: string }> {
    return this.people.getUnscannedFaceImages();
  }

  // --- OCR methods ---

  getImagePath(imageId: number): string | null {
    const row = this.db
      .prepare('SELECT file_path FROM images WHERE id = ?')
      .get(imageId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  getOcrStatus(imageId: number): { status: OcrStatus; at: number | null } {
    return this.ocr.getOcrStatus(imageId);
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
    return this.ocr.getImageOcr(imageId);
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
    this.ocr.saveImageOcr(imageId, blocks);
  }

  markOcrError(imageId: number, message: string): void {
    this.ocr.markOcrError(imageId, message);
  }

  cleanupOrphanedPersons(): void {
    this.people.cleanupOrphanedPersons();
  }

  listFolders(): Folder[] {
    return this.folders.listFolders();
  }

  listFoldersWithStats(): FolderWithStats[] {
    return this.folders.listFoldersWithStats();
  }

  findFolderForPath(filePath: string): Folder | null {
    return this.folders.findFolderForPath(filePath);
  }

  getFolderAvailabilityState(
    folderPath: string,
  ): { available: boolean; writable: boolean } | null {
    return this.folders.getFolderAvailabilityState(folderPath);
  }

  updateFolderAvailabilityState(folderPath: string, available: boolean, writable: boolean): void {
    this.folders.updateFolderAvailabilityState(folderPath, available, writable);
  }

  getFolderFaceScanExclusion(folderPath: string): boolean | null {
    return this.folders.getFolderFaceScanExclusion(folderPath);
  }

  setFolderFaceScanExclusionFlag(folderPath: string, excluded: boolean): void {
    this.folders.setFolderFaceScanExclusionFlag(folderPath, excluded);
  }

  clearMissingByPathPrefix(pathPrefix: string): void {
    this.folders.clearMissingByPathPrefix(pathPrefix);
  }

  markMissingByPathPrefix(pathPrefix: string, excludedFolderPath: string): void {
    this.folders.markMissingByPathPrefix(pathPrefix, excludedFolderPath);
  }

  deleteFacesByImagePathPrefix(pathPrefix: string): void {
    this.folders.deleteFacesByImagePathPrefix(pathPrefix);
  }

  markFacesUnscannedByPathPrefix(pathPrefix: string): void {
    this.folders.markFacesUnscannedByPathPrefix(pathPrefix);
  }

  setImageHidden(imageId: number): void {
    this.folders.setImageHidden(imageId);
  }

  setImageMissingByPath(filePath: string): void {
    this.folders.setImageMissingByPath(filePath);
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
    this.tags.updateImageMetadata(imageId, metadata);
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
