import type Database from 'better-sqlite3';
import path from 'path';
import type { Folder, FolderWithStats } from 'shared';

export class DatabaseFolderRepository {
  constructor(private readonly db: Database.Database) {}

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
}
