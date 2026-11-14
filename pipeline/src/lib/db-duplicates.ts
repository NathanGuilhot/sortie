import type Database from 'better-sqlite3';
import type { FileAnalysis } from './duplicate-analysis';

export interface StoredAnalysis extends FileAnalysis {
  id: number;
}
export interface CleanupMove {
  id: string;
  image_id: number;
  keeper_id: number;
  keeper_hash: string;
  file_path: string;
  source_hash: string;
  state: 'pending' | 'moving' | 'trashed' | 'complete' | 'failed' | 'uncertain';
  error: string | null;
}

export class DatabaseDuplicateRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly vecLoaded: boolean,
  ) {}

  get(imageId: number): StoredAnalysis | null {
    return (
      (this.db
        .prepare('SELECT image_id AS id, * FROM image_analysis WHERE image_id = ?')
        .get(imageId) as StoredAnalysis | undefined) ?? null
    );
  }

  invalidate(imageId: number): void {
    this.db.prepare('DELETE FROM image_analysis WHERE image_id = ?').run(imageId);
  }

  private clearDerived(imageId: number): void {
    if (this.vecLoaded) {
      this.db.prepare('DELETE FROM vec_images WHERE rowid = ?').run(imageId);
      this.db
        .prepare(
          'DELETE FROM vec_palette WHERE rowid IN (SELECT id FROM palette_colors WHERE image_id = ?)',
        )
        .run(imageId);
    }
    this.db.prepare('DELETE FROM palette_colors WHERE image_id = ?').run(imageId);
    this.db.prepare('DELETE FROM image_ocr WHERE image_id = ?').run(imageId);
    this.db
      .prepare(
        'UPDATE images SET palette_json = NULL, ocr_status = NULL, ocr_at = NULL WHERE id = ?',
      )
      .run(imageId);
  }

  save(imageId: number, analysis: FileAnalysis): void {
    this.db.transaction(() => {
      const previous = this.db.prepare('SELECT file_hash FROM images WHERE id = ?').get(imageId) as
        | { file_hash: string | null }
        | undefined;
      if (!previous) throw new Error('The image was removed during analysis.');
      if (previous.file_hash !== analysis.source_hash) this.clearDerived(imageId);
      this.db
        .prepare(
          `UPDATE images SET file_hash = ?, file_size = ?, file_mtime_ms = ?,
        width = COALESCE(?, width), height = COALESCE(?, height) WHERE id = ?`,
        )
        .run(
          analysis.source_hash,
          analysis.file_size,
          analysis.file_mtime_ms,
          analysis.width,
          analysis.height,
          imageId,
        );
      this.db
        .prepare(
          `INSERT OR REPLACE INTO image_analysis
        (image_id, source_hash, source_stamp, file_size, file_mtime_ms, version, width, height, fingerprint, pixels, visual_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          imageId,
          analysis.source_hash,
          analysis.source_stamp,
          analysis.file_size,
          analysis.file_mtime_ms,
          analysis.version,
          analysis.width,
          analysis.height,
          analysis.fingerprint,
          analysis.pixels ? Buffer.from(analysis.pixels) : null,
          analysis.visual_error,
        );
    })();
  }

  dismissedPairs(): string[] {
    const rows = this.db
      .prepare(
        `SELECT d.image_id_1 AS a, d.image_id_2 AS b
      FROM dismissed_duplicates d
      JOIN image_analysis a ON a.image_id = d.image_id_1 AND a.source_hash = d.file_hash_1
      JOIN image_analysis b ON b.image_id = d.image_id_2 AND b.source_hash = d.file_hash_2`,
      )
      .all() as Array<{ a: number; b: number }>;
    return rows.map(({ a, b }) => `${a}:${b}`);
  }

  dismiss(ids: number[]): void {
    const insert = this.db.prepare(`INSERT OR REPLACE INTO dismissed_duplicates
      (image_id_1, image_id_2, file_hash_1, file_hash_2) VALUES (?, ?, ?, ?)`);
    this.db.transaction(() => {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = [ids[i], ids[j]].sort((a, b) => a - b);
          const left = this.get(a),
            right = this.get(b);
          if (!left || !right) throw new Error('Scan again before keeping this group.');
          insert.run(a, b, left.source_hash, right.source_hash);
        }
    })();
  }

  prepareMove(move: Omit<CleanupMove, 'state' | 'error'>): void {
    this.db
      .prepare(
        `INSERT INTO cleanup_moves (id, image_id, keeper_id, keeper_hash, file_path, source_hash, state)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        move.id,
        move.image_id,
        move.keeper_id,
        move.keeper_hash,
        move.file_path,
        move.source_hash,
      );
  }

  setMoveState(id: string, state: CleanupMove['state'], error: string | null = null): void {
    this.db
      .prepare('UPDATE cleanup_moves SET state = ?, error = ? WHERE id = ?')
      .run(state, error, id);
  }

  pendingMoves(): CleanupMove[] {
    return this.db
      .prepare("SELECT * FROM cleanup_moves WHERE state IN ('pending', 'moving', 'trashed')")
      .all() as CleanupMove[];
  }

  finishMove(move: CleanupMove): void {
    this.db.transaction(() => {
      const keeper = this.db
        .prepare('SELECT 1 FROM images WHERE id = ? AND file_hash = ?')
        .get(move.keeper_id, move.keeper_hash);
      const source = this.db
        .prepare('SELECT 1 FROM images WHERE id = ? AND file_hash = ? AND file_path = ?')
        .get(move.image_id, move.source_hash, move.file_path);
      if (!keeper || !source)
        throw new Error(
          'An image changed before cleanup could finish. Its recovery record has been retained.',
        );
      // Boards use image_tags internally. Retain the removed record for OS Trash restoration.
      this.db
        .prepare(
          `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, confidence, position, created_at)
        SELECT ?, tag_id, source, confidence, position, created_at FROM image_tags WHERE image_id = ?`,
        )
        .run(move.keeper_id, move.image_id);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO collection_images (collection_id, image_id, added_at)
        SELECT collection_id, ?, added_at FROM collection_images WHERE image_id = ?`,
        )
        .run(move.keeper_id, move.image_id);
      this.db.prepare('UPDATE images SET missing = 1, trashed = 1 WHERE id = ?').run(move.image_id);
      this.clearDerived(move.image_id);
      this.invalidate(move.image_id);
      this.setMoveState(move.id, 'complete');
    })();
  }

  removeOrphanVectors(): void {
    if (!this.vecLoaded) return;
    this.db.prepare('DELETE FROM vec_images WHERE rowid NOT IN (SELECT id FROM images)').run();
    this.db
      .prepare('DELETE FROM vec_palette WHERE rowid NOT IN (SELECT id FROM palette_colors)')
      .run();
  }
}
