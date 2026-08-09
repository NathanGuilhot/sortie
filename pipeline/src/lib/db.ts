import Database from 'better-sqlite3';
import path from 'path';
import { type AppSettingKey } from 'shared';
import { DatabaseImageRepository } from './db-images';
import { DatabaseBoardRepository } from './db-boards';
import { extractExif } from './exif';
import { DatabaseFolderRepository } from './db-folders';
import { runDatabaseMigrations } from './db-migrations';
import { DatabaseOcrRepository } from './db-ocr';
import { DatabasePaletteRepository } from './db-palette';
import { DatabasePeopleRepository } from './db-people';
import { setupDatabaseSchema } from './db-schema';
import { DatabaseTagRepository } from './db-tags';
import { DatabaseVectorRepository } from './db-vectors';

export class DatabaseManager {
  private db: Database.Database;
  private vecLoaded = false;
  readonly images: DatabaseImageRepository;
  readonly tags: DatabaseTagRepository;
  readonly vectors: DatabaseVectorRepository;
  readonly palettes: DatabasePaletteRepository;
  readonly people: DatabasePeopleRepository;
  readonly ocr: DatabaseOcrRepository;
  readonly folders: DatabaseFolderRepository;
  readonly boards: DatabaseBoardRepository;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.setupPragmas();
    this.setupExtensions();
    this.setupSchema();
    this.runMigrations();
    this.tags = new DatabaseTagRepository(this.db);
    this.images = new DatabaseImageRepository(this.db, this.tags, this.vecLoaded);
    this.vectors = new DatabaseVectorRepository(this.db, this.vecLoaded);
    this.palettes = new DatabasePaletteRepository(this.db, this.vecLoaded);
    this.people = new DatabasePeopleRepository(this.db, this.vecLoaded);
    this.ocr = new DatabaseOcrRepository(this.db);
    this.folders = new DatabaseFolderRepository(this.db, this.vecLoaded);
    this.boards = new DatabaseBoardRepository(this.db);
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

  close() {
    this.db.close();
  }

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Raw database access is intentionally confined to the shared test harness.
   * Production callers use the namespaced repositories above instead.
   */
  static createForTesting(): { manager: DatabaseManager; raw: Database.Database } {
    const manager = new DatabaseManager(':memory:');
    return { manager, raw: manager.db };
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

  resetFaceData(): void {
    this.people.clearAllFaceData();
  }

  resetAllData(): void {
    const tableRows = this.db.prepare('PRAGMA table_list').all() as Array<{
      name: string;
      type: string;
      schema: string;
    }>;
    const mainTables = tableRows.filter(
      (row) => row.schema === 'main' && !row.name.startsWith('sqlite_'),
    );
    const virtualTableNames = mainTables
      .filter((row) => row.type === 'virtual')
      .map((row) => row.name);
    const isVecShadow = (name: string): boolean =>
      virtualTableNames.some((virtualTable) => name.startsWith(`${virtualTable}_`));
    const rows = mainTables.filter(
      (row) => (row.type === 'table' || row.type === 'virtual') && !isVecShadow(row.name),
    );

    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.transaction(() => {
        for (const { name } of rows) {
          this.db.prepare(`DELETE FROM "${name}"`).run();
        }
      })();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }
}
