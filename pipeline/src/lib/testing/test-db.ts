import type Database from 'better-sqlite3';
import type { OriginKind } from 'shared';
import { DatabaseManager } from '../db';

// In-memory database initialized with the production schema and migrations.

export interface TestDb {
  manager: DatabaseManager;
  raw: Database.Database;
  close(): void;
}

export function createTestDb(): TestDb {
  const { manager, raw } = DatabaseManager.createForTesting();
  return {
    manager,
    raw,
    close: () => manager.close(),
  };
}

export function seedFolder(
  t: TestDb,
  folderPath: string,
  opts: Partial<{ available: boolean; writable: boolean; watched: boolean }> = {},
): number {
  const result = t.raw
    .prepare('INSERT INTO folders (path, available, writable, watched) VALUES (?, ?, ?, ?)')
    .run(
      folderPath,
      opts.available === false ? 0 : 1,
      opts.writable === false ? 0 : 1,
      opts.watched === false ? 0 : 1,
    );
  return Number(result.lastInsertRowid);
}

export function seedImage(
  t: TestDb,
  filePath: string,
  opts: Partial<{
    hidden: boolean;
    missing: boolean;
    fileSize: number;
    facesScanned: boolean;
    capturedAt: string | null;
    originKind: OriginKind;
    originDomain: string | null;
    originAt: string | null;
  }> = {},
): number {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const result = t.raw
    .prepare(
      `INSERT INTO images (file_path, file_name, file_size, hidden, missing, faces_scanned,
                           captured_at, origin_kind, origin_domain, origin_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      filePath,
      fileName,
      opts.fileSize ?? null,
      opts.hidden ? 1 : 0,
      opts.missing ? 1 : 0,
      opts.facesScanned ? 1 : 0,
      opts.capturedAt ?? null,
      opts.originKind ?? null,
      opts.originDomain ?? null,
      opts.originAt ?? null,
    );
  return Number(result.lastInsertRowid);
}

export function seedFace(t: TestDb, imageId: number): number {
  const result = t.raw
    .prepare(
      `INSERT INTO faces (image_id, person_id, bbox_x, bbox_y, bbox_w, bbox_h, confidence)
       VALUES (?, NULL, 0, 0, 1, 1, 1)`,
    )
    .run(imageId);
  return Number(result.lastInsertRowid);
}
