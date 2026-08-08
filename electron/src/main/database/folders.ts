import type { DatabaseManager } from 'pipeline';
import { runWithConcurrency } from 'pipeline';
import type { Folder, FolderWithStats, ScanFolderResult, SortieProgress } from 'shared';
import type { AddImageResult } from './images';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { OVERLAP_EXCLUDE_CLAUSE, pathPrefixLikePattern, sqlPath } from 'pipeline';
import { IMAGE_EXTENSIONS } from '../database-helpers';

interface DatabaseFoldersDeps {
  requireDb(): DatabaseManager;
  addImage(filePath: string, options?: { invalidateCache?: boolean }): Promise<AddImageResult>;
  invalidateImageCache(): void;
}

const cpuCount = Math.max(1, os.cpus().length);
const WALK_CONCURRENCY = Math.min(32, Math.max(8, cpuCount * 4));
const IMAGE_PROCESSING_CONCURRENCY =
  process.platform === 'linux' ? 1 : Math.min(4, Math.max(2, Math.floor(cpuCount / 2)));

export class DatabaseFoldersService {
  constructor(private readonly deps: DatabaseFoldersDeps) {}

  private async collectImageFiles(folderPath: string, signal?: AbortSignal): Promise<string[]> {
    const imageFiles: string[] = [];
    const pendingDirs = [folderPath];
    let active = 0;
    let resolveDone: (() => void) | null = null;
    let rejectDone: ((error: unknown) => void) | null = null;

    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });

    const schedule = () => {
      if (signal?.aborted) {
        resolveDone?.();
        return;
      }

      while (active < WALK_CONCURRENCY && pendingDirs.length > 0) {
        const dir = pendingDirs.shift();
        if (!dir) continue;

        active += 1;
        void fs
          .readdir(dir, { withFileTypes: true })
          .then((entries) => {
            for (const entry of entries) {
              if (signal?.aborted) break;
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                pendingDirs.push(fullPath);
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (IMAGE_EXTENSIONS.has(ext)) {
                  imageFiles.push(fullPath);
                }
              }
            }
          })
          .then(
            () => {
              active -= 1;
              if (active === 0 && pendingDirs.length === 0) {
                resolveDone?.();
              } else {
                schedule();
              }
            },
            (error) => {
              rejectDone?.(error);
            },
          );
      }
    };

    schedule();
    await done;
    return imageFiles;
  }

  private async processImageFiles(
    imageFiles: string[],
    onProgress?: (progress: SortieProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ processed: number; cancelled: boolean }> {
    let completed = 0;
    let processed = 0;
    let skipped = 0;

    const { cancelled } = await runWithConcurrency(
      imageFiles,
      IMAGE_PROCESSING_CONCURRENCY,
      async (file) => {
        try {
          const result = await this.deps.addImage(file, { invalidateCache: false });
          if (result.skipped) {
            skipped += 1;
          } else {
            processed += 1;
          }
        } catch (error) {
          console.error(`Failed to process ${file}:`, error);
        }

        completed += 1;
        onProgress?.({
          current: completed,
          total: imageFiles.length,
          currentFile: file,
          processed,
          skipped,
        });
      },
      signal,
    );

    return { processed, cancelled };
  }

  async addFolder(folderPath: string): Promise<number> {
    const db = this.deps.requireDb().getDatabase();
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
      this.deps.requireDb().markMissingUnderFolder(normalized);
    }

    this.deps.invalidateImageCache();
    return row.id;
  }

  async findOverlappingFolders(
    folderPath: string,
  ): Promise<{ parents: string[]; children: string[] }> {
    return this.deps.requireDb().findOverlappingFolders(path.resolve(folderPath));
  }

  async scanFolder(
    folderPath: string,
    onProgress?: (progress: SortieProgress) => void,
    signal?: AbortSignal,
  ): Promise<ScanFolderResult> {
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

    console.log(`Scanning folder ${normalized} for images...`);
    const imageFiles = await this.collectImageFiles(normalized, signal);
    console.log(`Found ${imageFiles.length} image files`);

    const { processed, cancelled } = await this.processImageFiles(imageFiles, onProgress, signal);
    this.deps.invalidateImageCache();

    this.deps
      .requireDb()
      .getDatabase()
      .prepare(`UPDATE folders SET last_scanned = datetime('now') WHERE path = ?`)
      .run(normalized);

    console.log(`Scan completed: ${processed} images processed${cancelled ? ' (cancelled)' : ''}`);
    return { folderId, processed, cancelled };
  }

  async getFolders(): Promise<Folder[]> {
    return this.deps.requireDb().listFolders();
  }

  async getFoldersWithStats(): Promise<FolderWithStats[]> {
    return this.deps.requireDb().listFoldersWithStats();
  }

  async removeFolder(folderPath: string): Promise<void> {
    const db = this.deps.requireDb().getDatabase();
    const normalized = path.resolve(folderPath);
    const pattern = pathPrefixLikePattern(normalized);

    const txn = db.transaction(() => {
      const imageIds = db
        .prepare(
          `SELECT id FROM images
           WHERE ${sqlPath('file_path')} LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`,
        )
        .all(pattern, normalized) as Array<{ id: number }>;

      if (imageIds.length > 0) {
        const deleteVec = db.prepare('DELETE FROM vec_images WHERE rowid = ?');
        const deletePaletteVec = db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        const selectPaletteIds = db.prepare('SELECT id FROM palette_colors WHERE image_id = ?');
        const deleteImage = db.prepare('DELETE FROM images WHERE id = ?');

        for (const { id } of imageIds) {
          deleteVec.run(id);
          const colorIds = selectPaletteIds.all(id) as Array<{ id: number }>;
          for (const { id: colorId } of colorIds) {
            deletePaletteVec.run(BigInt(colorId));
          }
          deleteImage.run(id);
        }
      }

      db.prepare('DELETE FROM folders WHERE path = ?').run(normalized);
    });
    txn();

    this.deps.invalidateImageCache();
  }

  getFolderForPath(filePath: string): Folder | null {
    return this.deps.requireDb().findFolderForPath(path.resolve(filePath));
  }

  async markImageMissing(filePath: string): Promise<void> {
    this.deps.requireDb().setImageMissingByPath(filePath);
    this.deps.invalidateImageCache();
  }

  async setFolderAvailability(
    folderPath: string,
    available: boolean,
    writable: boolean,
  ): Promise<{ changed: boolean }> {
    const db = this.deps.requireDb();
    const normalized = path.resolve(folderPath);
    const current = db.getFolderAvailabilityState(normalized);
    if (!current) return { changed: false };

    const availableChanged = current.available !== available;
    const writableChanged = current.writable !== writable;
    if (!availableChanged && !writableChanged) return { changed: false };

    const txn = db.getDatabase().transaction(() => {
      db.updateFolderAvailabilityState(normalized, available, writable);
      if (availableChanged) {
        if (available) {
          db.clearMissingUnderFolder(normalized);
        } else {
          db.markMissingUnderFolder(normalized);
        }
      }
    });
    txn();

    if (availableChanged) {
      this.deps.invalidateImageCache();
    }

    return { changed: true };
  }

  async setFolderFaceScanExclusion(
    folderPath: string,
    excluded: boolean,
  ): Promise<{ changed: boolean }> {
    const db = this.deps.requireDb();
    const normalized = path.resolve(folderPath);
    const current = db.getFolderFaceScanExclusion(normalized);
    if (current === null) return { changed: false };
    if (current === excluded) return { changed: false };

    const txn = db.getDatabase().transaction(() => {
      db.setFolderFaceScanExclusionFlag(normalized, excluded);
      if (excluded) {
        db.deleteFacesUnderFolder(normalized);
        db.markFacesUnscannedUnderFolder(normalized);
      }
    });
    txn();

    if (excluded) db.cleanupOrphanedPersons();
    this.deps.invalidateImageCache();
    return { changed: true };
  }
}
