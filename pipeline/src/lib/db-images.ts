import type Database from 'better-sqlite3';
import path from 'path';
import {
  type Image,
  type LinkPreview,
  type PaletteColor,
  parseOptionalJson,
  type Tag,
} from 'shared';
import { sqlPath } from './db-path-sql';
import type { ExifData } from './exif';
import type { DatabaseTagRepository } from './db-tags';

interface ImageDbRow extends Omit<Image, 'embedded' | 'palette' | 'tags'> {
  palette_json: string | null;
  embedded: number;
}

export interface DatabaseImageMetadataUpdate {
  description?: string;
  favorite?: boolean;
  captured_at?: string | null;
  city?: string | null;
  country?: string | null;
  website_link?: string | null;
}

export interface ImageScanState {
  id: number;
  file_size: number | null;
  file_mtime_ms: number | null;
  file_hash: string | null;
  embedded: number;
  palette_json: string | null;
  faces_scanned: number;
}

export interface ImageSetFilter {
  includeHidden?: boolean;
  favorites?: boolean;
  personId?: number;
  folderId?: number;
  tags?: string[];
  dateRange?: { start?: string | null; end?: string | null };
}

export class DatabaseImageRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly tags: DatabaseTagRepository,
    private readonly vecLoaded: boolean,
  ) {}

  private embeddedColumn(): string {
    return this.vecLoaded
      ? '(i.id IN (SELECT rowid FROM vec_images)) AS embedded'
      : '0 AS embedded';
  }

  upsertImage(image: Omit<Image, 'id' | 'created_at' | 'modified_at'>): {
    id: number;
    created: boolean;
    fileHashMatched: boolean;
  } {
    const existing = this.db
      .prepare('SELECT id, file_hash, file_size FROM images WHERE file_path = ?')
      .get(image.file_path) as
      | { id: number; file_hash: string | null; file_size: number | null }
      | undefined;

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
             file_mtime_ms = ?,
             mime_type = ?,
             width = COALESCE(?, width),
             height = COALESCE(?, height),
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
          image.file_mtime_ms ?? null,
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
           file_mtime_ms, captured_at, latitude, longitude, city, country, description,
           favorite, hidden, file_hash, dhash,
           camera_make, camera_model, aperture, iso, exposure_time, focal_length
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        image.file_path,
        image.file_name,
        image.file_size,
        image.mime_type,
        image.width,
        image.height,
        image.file_mtime_ms ?? null,
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

  getImageScanState(filePath: string): ImageScanState | null {
    const row = this.db
      .prepare(
        `SELECT i.id, i.file_size, i.file_mtime_ms, i.file_hash, i.palette_json,
                i.faces_scanned,
                ${this.embeddedColumn()}
         FROM images i
         WHERE i.file_path = ?`,
      )
      .get(filePath) as ImageScanState | undefined;
    return row ?? null;
  }

  getVisibleImageIds(): number[] {
    const rows = this.db
      .prepare('SELECT id FROM images WHERE hidden = 0 AND missing = 0')
      .all() as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getFilteredImageIds(filter: ImageSetFilter): number[] {
    const where: string[] = [
      filter.includeHidden ? 'i.missing = 0' : 'i.hidden = 0 AND i.missing = 0',
    ];
    const params: Array<string | number> = [];

    if (filter.favorites) where.push('i.favorite = 1');

    if (filter.personId != null) {
      where.push('EXISTS (SELECT 1 FROM faces f WHERE f.image_id = i.id AND f.person_id = ?)');
      params.push(filter.personId);
    }

    if (filter.folderId != null) {
      where.push(
        `EXISTS (SELECT 1 FROM folders fo WHERE fo.id = ? AND ${sqlPath('i.file_path')} LIKE ${sqlPath('fo.path')} || '/%')`,
      );
      params.push(filter.folderId);
    }

    if (filter.tags && filter.tags.length > 0) {
      const placeholders = filter.tags.map(() => '?').join(',');
      where.push(
        `(SELECT COUNT(DISTINCT t.id)
            FROM image_tags it JOIN tags t ON it.tag_id = t.id
            WHERE it.image_id = i.id AND t.name IN (${placeholders})) = ?`,
      );
      params.push(...filter.tags, filter.tags.length);
    }

    if (filter.dateRange?.start) {
      where.push('i.captured_at >= ?');
      params.push(filter.dateRange.start);
    }
    if (filter.dateRange?.end) {
      where.push('i.captured_at <= ?');
      params.push(filter.dateRange.end);
    }

    const rows = this.db
      .prepare(`SELECT i.id FROM images i WHERE ${where.join(' AND ')}`)
      .all(...params) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  filterVisibleImageIds(ids: number[]): Set<number> {
    if (ids.length === 0) return new Set();
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT id FROM images WHERE id IN (${placeholders}) AND hidden = 0 AND missing = 0`)
      .all(...ids) as Array<{ id: number }>;
    return new Set(rows.map((row) => row.id));
  }

  getImagesByIds(ids: number[]): Image[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT i.*, i.palette_json, ${this.embeddedColumn()}
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
        tags: this.tags.getImageTags(id) as Tag[],
      });
    }

    return images;
  }

  getImageById(imageId: number): Image | null {
    const row = this.db
      .prepare(
        `SELECT i.*, i.palette_json, ${this.embeddedColumn()}
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
      tags: this.tags.getImageTags(imageId) as Tag[],
    };
  }

  getImagePath(imageId: number): string | null {
    const row = this.db.prepare('SELECT file_path FROM images WHERE id = ?').get(imageId) as
      | { file_path: string }
      | undefined;
    return row?.file_path ?? null;
  }

  getImageIdByPath(filePath: string): number | null {
    // `path.resolve` owns native paths; use win32 normalization as well so
    // cross-platform callers and stored Windows libraries keep the shared
    // separator-insensitive comparison contract.
    const normalizedPath = path.win32.isAbsolute(filePath)
      ? path.win32.normalize(filePath)
      : path.resolve(filePath);
    const row = this.db
      .prepare(`SELECT id FROM images WHERE ${sqlPath('file_path')} = ${sqlPath('?')}`)
      .get(normalizedPath) as { id: number } | undefined;
    return row?.id ?? null;
  }

  clearMissingFlag(imageId: number): void {
    this.db.prepare('UPDATE images SET missing = 0 WHERE id = ? AND missing <> 0').run(imageId);
  }

  setMissingFlag(imageId: number, missing: boolean): void {
    this.db
      .prepare("UPDATE images SET missing = ?, modified_at = datetime('now') WHERE id = ?")
      .run(missing ? 1 : 0, imageId);
  }

  listImagesOutsideAnyFolder(): Array<{ id: number; file_path: string; missing: number }> {
    return this.db
      .prepare(
        `SELECT i.id, i.file_path, i.missing
         FROM images i
         WHERE i.hidden = 0
           AND NOT EXISTS (
             SELECT 1 FROM folders f
             WHERE ${sqlPath('i.file_path')} = ${sqlPath('f.path')}
               OR ${sqlPath('i.file_path')} LIKE ${sqlPath('f.path')} || '/%'
           )`,
      )
      .all() as Array<{ id: number; file_path: string; missing: number }>;
  }

  listImagesMissingCameraExif(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare(
        'SELECT id, file_path FROM images WHERE camera_make IS NULL AND camera_model IS NULL',
      )
      .all() as Array<{ id: number; file_path: string }>;
  }

  updateImageCameraExif(
    imageId: number,
    exif: Pick<
      ExifData,
      'cameraMake' | 'cameraModel' | 'aperture' | 'iso' | 'exposureTime' | 'focalLength'
    >,
  ): void {
    this.db
      .prepare(
        `UPDATE images SET camera_make = ?, camera_model = ?, aperture = ?, iso = ?, exposure_time = ?, focal_length = ? WHERE id = ?`,
      )
      .run(
        exif.cameraMake,
        exif.cameraModel,
        exif.aperture,
        exif.iso,
        exif.exposureTime,
        exif.focalLength,
        imageId,
      );
  }

  getImagesMissingFileHash(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare(
        'SELECT id, file_path FROM images WHERE hidden = 0 AND missing = 0 AND file_hash IS NULL',
      )
      .all() as Array<{ id: number; file_path: string }>;
  }

  updateImageFileHash(imageId: number, fileHash: string): void {
    this.db.prepare('UPDATE images SET file_hash = ? WHERE id = ?').run(fileHash, imageId);
  }

  updateImageMetadata(imageId: number, metadata: DatabaseImageMetadataUpdate): void {
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

  deleteImageRecord(imageId: number): void {
    this.db.prepare('DELETE FROM images WHERE id = ?').run(imageId);
  }
}
