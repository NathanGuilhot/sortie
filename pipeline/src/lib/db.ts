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
  type AppSettingKey,
  type OcrStatus,
} from 'shared';
import {
  DatabaseImageRepository,
  type DatabaseImageMetadataUpdate,
  type ImageScanState,
} from './db-images';
import { extractExif } from './exif';
import { DatabaseFolderRepository } from './db-folders';
import { runDatabaseMigrations } from './db-migrations';
import { DatabaseOcrRepository } from './db-ocr';
import { DatabasePaletteRepository } from './db-palette';
import { DatabasePeopleRepository, type VecMatchRow } from './db-people';
import { setupDatabaseSchema } from './db-schema';
import { DatabaseTagRepository, type DismissedDbRow, type TagDbRow } from './db-tags';
import { DatabaseVectorRepository } from './db-vectors';

export class DatabaseManager {
  private db: Database.Database;
  private vecLoaded = false;
  private readonly images: DatabaseImageRepository;
  private readonly tags: DatabaseTagRepository;
  private readonly vectors: DatabaseVectorRepository;
  private readonly palettes: DatabasePaletteRepository;
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
    this.images = new DatabaseImageRepository(this.db, this.tags);
    this.vectors = new DatabaseVectorRepository(this.db);
    this.palettes = new DatabasePaletteRepository(this.db, this.vecLoaded);
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
    return this.images.upsertImage(image);
  }

  insertEmbedding(rowid: number, embedding: number[]) {
    this.vectors.insertEmbedding(rowid, embedding);
  }

  insertPalette(imageId: number, palette: PaletteColor[]): void {
    this.palettes.insertPalette(imageId, palette);
  }

  getPalette(imageId: number): PaletteColor[] | null {
    return this.palettes.getPalette(imageId);
  }

  getImagesMissingPalette(): Array<{ id: number; file_path: string }> {
    return this.palettes.getImagesMissingPalette();
  }

  getVisibleImageIds(): number[] {
    return this.images.getVisibleImageIds();
  }

  getImagesByIds(ids: number[]): Image[] {
    return this.images.getImagesByIds(ids);
  }

  getImageById(imageId: number): Image | null {
    return this.images.getImageById(imageId);
  }

  getImageScanState(filePath: string): ImageScanState | null {
    return this.images.getImageScanState(filePath);
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
    return this.palettes.findImagesByColors(queryLabs, limit);
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
    // Idempotent backfill: only inspect rows that are still missing dimensions.
    // Once all rows have dimensions the SELECT returns nothing and this is a
    // no-op, so no global "done" flag is needed. A failed extraction (e.g.
    // file on an unmounted volume) is silently skipped so the row is retried
    // next launch — never overwrite valid dims with null.
    const rows = this.db
      .prepare('SELECT id, file_path FROM images WHERE width IS NULL OR height IS NULL')
      .all() as Array<{ id: number; file_path: string }>;

    let fixed = 0;
    const update = this.db.prepare('UPDATE images SET width = ?, height = ? WHERE id = ?');
    for (const row of rows) {
      try {
        const exif = await extractExif(row.file_path);
        if (exif.width != null && exif.height != null) {
          update.run(exif.width, exif.height, row.id);
          fixed += 1;
        }
      } catch (error) {
        console.warn(`Failed to fix dimensions for ${row.file_path}:`, error);
      }
    }

    return { fixedImageDimensions: fixed };
  }

  getVisibleEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return this.vectors.getVisibleEmbeddings();
  }

  getEmbedding(imageId: number): number[] | null {
    return this.vectors.getEmbedding(imageId);
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

  insertFaceClipEmbedding(faceRowid: number, embedding: number[]): void {
    this.people.insertFaceClipEmbedding(faceRowid, embedding);
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

  findNearestFace(embedding: number[], limit: number = 1): VecMatchRow[] {
    return this.people.findNearestFace(embedding, limit);
  }

  findNearestFaceClip(embedding: number[], limit: number = 1): VecMatchRow[] {
    return this.people.findNearestFaceClip(embedding, limit);
  }

  getPersonFaceClipEmbeddings(personId: number): number[][] {
    return this.people.getPersonFaceClipEmbeddings(personId);
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
    return this.images.getImagePath(imageId);
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

  getFolderAvailabilityState(folderPath: string): { available: boolean; writable: boolean } | null {
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

  updateImageMetadata(imageId: number, metadata: DatabaseImageMetadataUpdate): void {
    this.images.updateImageMetadata(imageId, metadata);
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
    return this.images.getImagesMissingFileHash();
  }

  updateImageFileHash(imageId: number, fileHash: string): void {
    this.images.updateImageFileHash(imageId, fileHash);
  }

  getVisibleImagesForDuplicates(): Image[] {
    return this.images.getVisibleImagesForDuplicates();
  }

  findNearestImageMatches(embedding: number[], limit: number): VecMatchRow[] {
    return this.vectors.findNearestImageMatches(embedding, limit);
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
    this.images.deleteImageRecord(imageId);
  }
}
