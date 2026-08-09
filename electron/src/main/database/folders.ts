import type { DatabaseManager } from 'pipeline';
import { runWithConcurrency } from 'pipeline';
import type { Folder, FolderWithStats, ScanFolderResult, SortieProgress } from 'shared';
import type { AddImageResult } from './images';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
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

export class FolderReadError extends Error {
  readonly code: string | undefined;

  constructor(
    readonly folderPath: string,
    cause: unknown,
  ) {
    super(`Unable to read folder: ${folderPath}`, { cause });
    this.name = 'FolderReadError';
    this.code =
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? String(cause.code)
        : undefined;
  }
}

export function isFolderAccessDenied(error: unknown): error is FolderReadError {
  return error instanceof FolderReadError && (error.code === 'EACCES' || error.code === 'EPERM');
}

export class DatabaseFoldersService {
  constructor(private readonly deps: DatabaseFoldersDeps) {}

  private async collectImageFiles(folderPath: string, signal?: AbortSignal): Promise<string[]> {
    const imageFiles: string[] = [];
    const pendingDirs = [folderPath];
    let active = 0;
    let failed = false;
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
      if (failed) return;

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
              active -= 1;
              failed = true;
              pendingDirs.length = 0;
              rejectDone?.(new FolderReadError(dir, error));
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
    const normalized = path.resolve(folderPath);
    let available = true;
    try {
      await fs.access(normalized);
    } catch {
      available = false;
    }

    const folderId = this.deps.requireDb().folders.upsertFolder(normalized, available);

    if (!available) {
      this.deps.requireDb().folders.markMissingUnderFolder(normalized);
    }

    this.deps.invalidateImageCache();
    return folderId;
  }

  async findOverlappingFolders(
    folderPath: string,
  ): Promise<{ parents: string[]; children: string[] }> {
    return this.deps.requireDb().folders.findOverlappingFolders(path.resolve(folderPath));
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

    this.deps.requireDb().folders.markFolderScanned(normalized);

    console.log(`Scan completed: ${processed} images processed${cancelled ? ' (cancelled)' : ''}`);
    return { folderId, processed, cancelled };
  }

  async getFolders(): Promise<Folder[]> {
    return this.deps.requireDb().folders.listFolders();
  }

  async getFoldersWithStats(): Promise<FolderWithStats[]> {
    return this.deps.requireDb().folders.listFoldersWithStats();
  }

  setFolderWatched(folderPath: string, watched: boolean): void {
    this.deps.requireDb().folders.setFolderWatched(path.resolve(folderPath), watched);
  }

  async removeFolder(folderPath: string): Promise<void> {
    const normalized = path.resolve(folderPath);
    this.deps.requireDb().folders.removeFolderAndOrphanedImages(normalized);

    this.deps.invalidateImageCache();
  }

  getFolderForPath(filePath: string): Folder | null {
    return this.deps.requireDb().folders.findFolderForPath(path.resolve(filePath));
  }

  async markImageMissing(filePath: string): Promise<void> {
    this.deps.requireDb().folders.setImageMissingByPath(filePath);
    this.deps.invalidateImageCache();
  }

  async setFolderAvailability(
    folderPath: string,
    available: boolean,
    writable: boolean,
  ): Promise<{ changed: boolean }> {
    const db = this.deps.requireDb();
    const normalized = path.resolve(folderPath);
    const current = db.folders.getFolderAvailabilityState(normalized);
    if (!current) return { changed: false };

    const availableChanged = current.available !== available;
    const writableChanged = current.writable !== writable;
    if (!availableChanged && !writableChanged) return { changed: false };

    db.runInTransaction(() => {
      db.folders.updateFolderAvailabilityState(normalized, available, writable);
      if (availableChanged) {
        if (available) {
          db.folders.clearMissingUnderFolder(normalized);
        } else {
          db.folders.markMissingUnderFolder(normalized);
        }
      }
    });

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
    const current = db.folders.getFolderFaceScanExclusion(normalized);
    if (current === null) return { changed: false };
    if (current === excluded) return { changed: false };

    db.runInTransaction(() => {
      db.folders.setFolderFaceScanExclusionFlag(normalized, excluded);
      if (excluded) {
        db.folders.deleteFacesUnderFolder(normalized);
        db.folders.markFacesUnscannedUnderFolder(normalized);
      }
    });

    if (excluded) db.people.cleanupOrphanedPersons();
    this.deps.invalidateImageCache();
    return { changed: true };
  }
}
