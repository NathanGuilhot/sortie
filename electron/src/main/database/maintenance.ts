import type { ClipEmbedder, DatabaseManager } from 'pipeline';
import { classifyOrigin, createProvenanceReader, extractExif, extractPalette } from 'pipeline';
import { mostSpecificFolderForPath, type BackfillExifResult } from 'shared';
import fs from 'fs/promises';
import path from 'path';
import type { FileDeletionError } from '../database';

interface DatabaseMaintenanceDeps {
  requireDb(): DatabaseManager;
  invalidateImageCache(): void;
  getEmbedder(): ClipEmbedder;
  createFileDeletionError(
    filePath: string,
    code: string | undefined,
    cause: Error,
  ): FileDeletionError;
}

export class DatabaseMaintenanceService {
  constructor(private readonly deps: DatabaseMaintenanceDeps) {}

  async resetDatabase(): Promise<void> {
    this.deps.requireDb().resetAllData();
    this.deps.invalidateImageCache();
  }

  async backfillExifData(signal?: AbortSignal): Promise<BackfillExifResult> {
    const db = this.deps.requireDb();

    console.log('[migration] backfilling camera EXIF data...');
    const rows = db.images.listImagesMissingCameraExif();

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
          db.images.updateImageCameraExif(row.id, exif);
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

  // Group by folder to reuse each Spotlight prefilter.
  async backfillProvenance(signal?: AbortSignal): Promise<{ filled: number; cancelled: boolean }> {
    const db = this.deps.requireDb();
    const rows = db.images.listImagesMissingOrigin();
    if (rows.length === 0) return { filled: 0, cancelled: false };

    console.log(`[migration] recovering provenance for ${rows.length} images...`);

    const libraryFolders = db.folders.listFolders();
    const byFolder = new Map<string, Array<{ id: number; file_path: string }>>();
    for (const row of rows) {
      const folder = mostSpecificFolderForPath(libraryFolders, row.file_path)?.path;
      const readerRoot = folder ?? path.dirname(row.file_path);
      const group = byFolder.get(readerRoot);
      if (group) group.push(row);
      else byFolder.set(readerRoot, [row]);
    }

    let filled = 0;
    let cancelled = false;

    for (const [folder, group] of byFolder) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const reader = await createProvenanceReader(folder);
      for (const row of group) {
        if (signal?.aborted) {
          cancelled = true;
          break;
        }

        try {
          const exif = await extractExif(row.file_path);
          const origin = classifyOrigin(await reader.read(row.file_path), {
            hasCameraExif: !!(exif.cameraMake || exif.cameraModel),
          });
          db.images.setImageOrigin(row.id, {
            origin_kind: origin.kind,
            origin_domain: origin.domain,
            origin_at: origin.at,
            website_link: origin.url,
          });
          filled++;
        } catch (error) {
          console.warn(`Failed to recover provenance for ${row.file_path}:`, error);
        }
      }
    }

    this.deps.invalidateImageCache();
    console.log(
      `[migration] recovered provenance for ${filled}/${rows.length} images${cancelled ? ' (cancelled)' : ''}`,
    );
    return { filled, cancelled };
  }

  async recomputeEmbedding(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.images.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);

    const embedding = await this.deps.getEmbedder().embedImage(filePath);
    db.vectors.insertEmbedding(imageId, embedding);
    this.deps.invalidateImageCache();
  }

  async recomputePalette(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.images.getImagePath(imageId);
    if (!filePath) throw new Error(`Image ${imageId} not found`);

    const palette = await extractPalette(filePath);
    db.palettes.insertPalette(imageId, palette);
    this.deps.invalidateImageCache();
  }

  async computeMissingPalettes(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<{ computed: number; cancelled: boolean }> {
    const db = this.deps.requireDb();
    const pending = db.palettes.getImagesMissingPalette();
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
        db.palettes.insertPalette(id, palette);
        computed++;
      } catch (error) {
        console.error(`Failed to extract palette for ${file_path}:`, error);
      }

      onProgress?.({ current: index + 1, total: pending.length, currentFile: file_path });
    }

    if (computed > 0) this.deps.invalidateImageCache();
    return { computed, cancelled };
  }

  async deleteImage(imageId: number): Promise<void> {
    const db = this.deps.requireDb();
    const filePath = db.images.getImagePath(imageId);
    if (!filePath) return;

    try {
      await fs.unlink(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        throw this.deps.createFileDeletionError(filePath, code, error as Error);
      }
    }

    db.images.deleteImageRecord(imageId);
    this.deps.invalidateImageCache();
  }
}
