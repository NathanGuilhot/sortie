import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from 'pipeline';
import type { ClipEmbedder } from 'pipeline';
import type { FileDeletionError } from '../database';
import { DatabaseMaintenanceService } from '../database/maintenance';

describe('database reset', () => {
  let manager: DatabaseManager | null = null;

  afterEach(() => {
    manager?.close();
    manager = null;
  });

  it('does not try to delete sqlite-vec shadow tables directly', async () => {
    manager = new DatabaseManager(':memory:');
    const db = manager.getDatabase();
    db.prepare('INSERT INTO folders (path) VALUES (?)').run('C:\\Photos');
    db.prepare('INSERT INTO images (file_path, file_name) VALUES (?, ?)').run(
      'C:\\Photos\\a.jpg',
      'a.jpg',
    );
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('onboarding_seen', '1');

    const hasVecShadowTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE name = 'vec_images_info'")
      .get();

    const service = new DatabaseMaintenanceService({
      requireDb: () => manager!,
      invalidateImageCache: () => undefined,
      getEmbedder: (() => undefined) as unknown as () => ClipEmbedder,
      createFileDeletionError: (() => undefined) as unknown as (
        filePath: string,
        code: string | undefined,
        cause: Error,
      ) => FileDeletionError,
    });

    await expect(service.resetDatabase()).resolves.toBeUndefined();
    expect(hasVecShadowTable).toBeTruthy();
    expect(db.prepare('SELECT COUNT(*) AS count FROM images').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM folders').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM app_settings').get()).toEqual({ count: 0 });
  });
});
