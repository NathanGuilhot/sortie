import type Database from 'better-sqlite3';
import { type Image, type PaletteColor, parseOptionalJson, type Tag } from 'shared';
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

export class DatabaseImageRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly tags: DatabaseTagRepository,
  ) {}

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
        tags: this.tags.getImageTags(id) as Tag[],
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
      tags: this.tags.getImageTags(imageId) as Tag[],
    };
  }

  getImagePath(imageId: number): string | null {
    const row = this.db
      .prepare('SELECT file_path FROM images WHERE id = ?')
      .get(imageId) as { file_path: string } | undefined;
    return row?.file_path ?? null;
  }

  getImagesMissingFileHash(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare('SELECT id, file_path FROM images WHERE hidden = 0 AND missing = 0 AND file_hash IS NULL')
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
