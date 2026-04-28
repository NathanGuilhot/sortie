import type { DatabaseManager } from 'pipeline';
import type { Folder, FolderWithStats, ScanFolderResult } from 'shared';
import path from 'path';
import fs from 'fs/promises';
import { OVERLAP_EXCLUDE_AVAILABLE_CLAUSE, OVERLAP_EXCLUDE_CLAUSE } from '../folder-overlap-sql';
import { IMAGE_EXTENSIONS } from '../database-helpers';

interface DatabaseFoldersDeps {
  requireDb(): DatabaseManager;
  addImage(filePath: string): Promise<number>;
  invalidateImageCache(): void;
}

export class DatabaseFoldersService {
  constructor(private readonly deps: DatabaseFoldersDeps) {}

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
      db.prepare(
        `UPDATE images SET missing = 1
         WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_AVAILABLE_CLAUSE}`,
      ).run(`${normalized}/%`, normalized);
    }

    this.deps.invalidateImageCache();
    return row.id;
  }

  async findOverlappingFolders(
    folderPath: string,
  ): Promise<{ parents: string[]; children: string[] }> {
    const db = this.deps.requireDb().getDatabase();
    const normalized = path.resolve(folderPath);
    const rows = db
      .prepare(
        `SELECT path FROM folders
         WHERE path <> ?
           AND (? LIKE path || '/%' OR path LIKE ? || '/%')`,
      )
      .all(normalized, normalized, normalized) as Array<{ path: string }>;

    const parents: string[] = [];
    const children: string[] = [];
    const childPrefix = `${normalized}/`;
    for (const { path: folder } of rows) {
      if (folder.startsWith(childPrefix)) {
        children.push(folder);
      } else {
        parents.push(folder);
      }
    }

    return { parents, children };
  }

  async scanFolder(
    folderPath: string,
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
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

    const imageFiles: string[] = [];

    async function walk(dir: string): Promise<void> {
      if (signal?.aborted) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (signal?.aborted) return;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.has(ext)) {
            imageFiles.push(fullPath);
          }
        }
      }
    }

    console.log(`Scanning folder ${normalized} for images...`);
    await walk(normalized);
    console.log(`Found ${imageFiles.length} image files`);

    let processed = 0;
    let cancelled = false;
    for (let index = 0; index < imageFiles.length; index++) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const file = imageFiles[index];
      try {
        await this.deps.addImage(file);
        processed++;
      } catch (error) {
        console.error(`Failed to process ${file}:`, error);
      }

      onProgress?.({ current: index + 1, total: imageFiles.length, currentFile: file });
    }

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
    const pattern = `${normalized}/%`;

    const txn = db.transaction(() => {
      const imageIds = db
        .prepare(
          `SELECT id FROM images
           WHERE file_path LIKE ? AND ${OVERLAP_EXCLUDE_CLAUSE}`,
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
        const pattern = `${normalized}/%`;
        if (available) {
          db.clearMissingByPathPrefix(pattern);
        } else {
          db.markMissingByPathPrefix(pattern, normalized);
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

    const pattern = `${normalized}/%`;
    const txn = db.getDatabase().transaction(() => {
      db.setFolderFaceScanExclusionFlag(normalized, excluded);
      if (excluded) {
        db.deleteFacesByImagePathPrefix(pattern);
        db.markFacesUnscannedByPathPrefix(pattern);
      }
    });
    txn();

    if (excluded) db.cleanupOrphanedPersons();
    this.deps.invalidateImageCache();
    return { changed: true };
  }
}
