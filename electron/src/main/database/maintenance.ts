import type { ClipEmbedder, DatabaseManager } from 'pipeline';
import { computeFileHash, extractExif, extractPalette } from 'pipeline';
import type { BackfillExifResult, DuplicateGroup, HashScanResult, Image } from 'shared';
import fs from 'fs/promises';
import type { FileDeletionError } from '../database';

interface DatabaseMaintenanceDeps {
  requireDb(): DatabaseManager;
  invalidateImageCache(): void;
  getEmbedder(): ClipEmbedder;
  createFileDeletionError(filePath: string, code: string | undefined, cause: Error): FileDeletionError;
}

export class DatabaseMaintenanceService {
  constructor(private readonly deps: DatabaseMaintenanceDeps) {}

  async resetFaceData(): Promise<void> {
    const db = this.deps.requireDb().getDatabase();
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
    const db = this.deps.requireDb().getDatabase();
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as Array<{ name: string }>;

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

    this.deps.invalidateImageCache();
  }

  async backfillExifData(signal?: AbortSignal): Promise<BackfillExifResult> {
    const db = this.deps.requireDb().getDatabase();

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
      } catch (error) {
        console.warn(`Failed to backfill EXIF for ${row.file_path}:`, error);
      }
    }

    this.deps.invalidateImageCache();
    console.log(
      `[migration] backfilled EXIF for ${filled}/${rows.length} images${cancelled ? ' (cancelled)' : ''}`,
    );
    return { filled, cancelled };
  }

  async recomputeEmbedding(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);

    const embedding = await this.deps.getEmbedder().embedImage(filePath);
    db.insertEmbedding(imageId, embedding);
    this.deps.invalidateImageCache();
  }

  async recomputePalette(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);

    const palette = await extractPalette(filePath);
    db.insertPalette(imageId, palette);
    this.deps.invalidateImageCache();
  }

  async computeMissingPalettes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<{ computed: number; cancelled: boolean }> {
    const db = this.deps.requireDb();
    const pending = db.getImagesMissingPalette();
    let computed = 0;
    let cancelled = false;

    for (let index = 0; index < pending.length; index++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const { id, file_path } = pending[index];
      try {
        const palette = await extractPalette(file_path);
        db.insertPalette(id, palette);
        computed++;
      } catch (error) {
        console.error(`Failed to extract palette for ${file_path}:`, error);
      }

      onProgress?.({ current: index + 1, total: pending.length, currentFile: file_path });
    }

    if (computed > 0) this.deps.invalidateImageCache();
    return { computed, cancelled };
  }

  async computeMissingHashes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<HashScanResult> {
    const db = this.deps.requireDb();
    const rows = db.getImagesMissingFileHash();
    let computed = 0;
    let cancelled = false;

    for (let index = 0; index < rows.length; index++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const row = rows[index];
      try {
        const fileHash = await computeFileHash(row.file_path);
        db.updateImageFileHash(row.id, fileHash);
        computed++;
      } catch (error) {
        console.warn(`Failed to hash ${row.file_path}:`, error);
      }

      onProgress?.({ current: index + 1, total: rows.length, currentFile: row.file_path });
    }

    this.deps.invalidateImageCache();
    return { computed, cancelled };
  }

  async findDuplicateGroups(): Promise<DuplicateGroup[]> {
    const db = this.deps.requireDb();
    const nearDuplicateDistance = 0.1;
    const vectorMatchLimit = 12;

    const images = db.getVisibleImagesForDuplicates();
    const imagesById = new Map(images.map((image) => [image.id, image]));

    const dismissed = db.getDismissedDuplicatePairs();
    const pairKey = (left: number, right: number) => `${Math.min(left, right)}_${Math.max(left, right)}`;
    const dismissedSet = new Set(
      dismissed.map((pair) => pairKey(pair.image_id_1, pair.image_id_2)),
    );

    const groups: DuplicateGroup[] = [];
    const seenPairs = new Set<string>();

    const hashBuckets = new Map<string, Image[]>();
    for (const image of images) {
      if (!image.file_hash) continue;
      const bucket = hashBuckets.get(image.file_hash) ?? [];
      bucket.push(image);
      hashBuckets.set(image.file_hash, bucket);
    }

    for (const bucket of hashBuckets.values()) {
      if (bucket.length < 2) continue;
      const filtered = bucket.filter((image, index) => {
        if (index === 0) return true;
        return !dismissedSet.has(pairKey(bucket[0].id, image.id));
      });
      if (filtered.length < 2) continue;

      for (let left = 0; left < filtered.length; left++) {
        for (let right = left + 1; right < filtered.length; right++) {
          seenPairs.add(pairKey(filtered[left].id, filtered[right].id));
        }
      }

      groups.push({
        groupId: Math.min(...filtered.map((image) => image.id)),
        images: filtered,
        matchType: 'exact',
      });
    }

    for (const image of images) {
      const embedding = db.getEmbedding(image.id);
      if (!embedding) continue;

      const matches = db.findNearestImageMatches(embedding, vectorMatchLimit);
      for (const match of matches) {
        if (match.rowid === image.id) continue;
        if (match.distance > nearDuplicateDistance) break;
        if (image.id >= match.rowid) continue;

        const other = imagesById.get(match.rowid);
        if (!other) continue;

        const key = pairKey(image.id, match.rowid);
        if (dismissedSet.has(key) || seenPairs.has(key)) continue;
        seenPairs.add(key);

        groups.push({
          groupId: Math.min(image.id, match.rowid),
          images: [image, other],
          matchType: 'visual',
        });
      }
    }

    groups.sort((left, right) => right.images.length - left.images.length || left.groupId - right.groupId);
    return groups;
  }

  async dismissDuplicatePair(imageId1: number, imageId2: number): Promise<void> {
    const lo = Math.min(imageId1, imageId2);
    const hi = Math.max(imageId1, imageId2);
    this.deps.requireDb().dismissDuplicatePair(lo, hi);
  }

  async deleteImage(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.getImagePath(imageId);
    if (!filePath) return;

    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw this.deps.createFileDeletionError(filePath, code, error as Error);
      }
    }

    db.deleteImageRecord(imageId);
    this.deps.invalidateImageCache();
  }
}
