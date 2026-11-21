import type Database from 'better-sqlite3';
import type { OcrStatus } from 'shared';
import { visibleImageSql } from './db-visibility';

/**
 * What an OCR job saw when it started. A result is saved only if the image is
 * still in that state, so a job that outlives an edit, a file change or a
 * deletion doesn't write stale text.
 */
export interface OcrJobStamp {
  status: OcrStatus;
  fileHash: string | null;
}

export interface OcrBlockRow {
  block_index: number;
  text: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  polygon_json: string | null;
  confidence: number;
}

export type OcrSearchBlockRow = OcrBlockRow & { image_id: number };

const MIN_TRIGRAM_LENGTH = 3;

export class DatabaseOcrRepository {
  constructor(private readonly db: Database.Database) {}

  getOcrStatus(imageId: number): { status: OcrStatus; at: number | null } {
    const row = this.db
      .prepare('SELECT ocr_status AS status, ocr_at AS at FROM images WHERE id = ?')
      .get(imageId) as { status: OcrStatus; at: number | null } | undefined;
    return row ?? { status: null, at: null };
  }

  stampJob(imageId: number): OcrJobStamp | null {
    const row = this.db
      .prepare('SELECT ocr_status AS status, file_hash AS fileHash FROM images WHERE id = ?')
      .get(imageId) as OcrJobStamp | undefined;
    return row ?? null;
  }

  private isUnchanged(imageId: number, stamp: OcrJobStamp): boolean {
    const current = this.stampJob(imageId);
    return (
      current !== null && current.status === stamp.status && current.fileHash === stamp.fileHash
    );
  }

  /**
   * Next visible image that has never been through OCR, newest first, below
   * `beforeId` when given. Images whose OCR came back empty or failed are not
   * picked again.
   */
  nextImageNeedingOcr(beforeId: number | null): number | null {
    const row = this.db
      .prepare(
        `SELECT id FROM images
         WHERE ocr_status IS NULL AND ${visibleImageSql()} AND (? IS NULL OR id < ?)
         ORDER BY id DESC LIMIT 1`,
      )
      .get(beforeId, beforeId) as { id: number } | undefined;
    return row?.id ?? null;
  }

  /**
   * Images whose OCR text contains every term (case- and accent-insensitive,
   * anywhere in the text). A shortlist: callers check the exact match.
   */
  findImagesWithText(
    terms: string[],
    options: { includeHidden: boolean; limit: number },
  ): number[] {
    const long = terms.filter((term) => [...term].length >= MIN_TRIGRAM_LENGTH);
    const short = terms.filter((term) => [...term].length < MIN_TRIGRAM_LENGTH);

    const where: string[] = [
      options.includeHidden ? 'i.missing = 0 AND i.trashed = 0' : visibleImageSql('i'),
    ];
    const params: Array<string | number> = [];
    if (long.length > 0) {
      where.push('f.text MATCH ?');
      params.push(long.map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND '));
    }
    for (const term of short) {
      where.push("f.text LIKE ? ESCAPE '\\'");
      params.push(`%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    }
    params.push(options.limit);
    const rows = this.db
      .prepare(
        `SELECT f.rowid AS id FROM image_ocr_fts f
         JOIN images i ON i.id = f.rowid
         WHERE ${where.join(' AND ')}
         ORDER BY f.rowid DESC
         LIMIT ?`,
      )
      .all(...params) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  getBlocksForImages(imageIds: number[]): Map<number, OcrSearchBlockRow[]> {
    const byImage = new Map<number, OcrSearchBlockRow[]>();
    if (imageIds.length === 0) return byImage;
    const rows = this.db
      .prepare(
        `SELECT image_id, block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence
         FROM image_ocr
         WHERE image_id IN (SELECT value FROM json_each(?))
         ORDER BY image_id, block_index`,
      )
      .all(JSON.stringify(imageIds)) as OcrSearchBlockRow[];
    for (const row of rows) {
      const list = byImage.get(row.image_id);
      if (list) list.push(row);
      else byImage.set(row.image_id, [row]);
    }
    return byImage;
  }

  invalidateImage(imageId: number): void {
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM image_ocr WHERE image_id = ?').run(imageId);
      this.db
        .prepare('UPDATE images SET ocr_status = NULL, ocr_at = NULL WHERE id = ?')
        .run(imageId);
    });
    txn();
  }

  getImageOcr(imageId: number): OcrBlockRow[] {
    return this.db
      .prepare(
        `SELECT block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence
         FROM image_ocr
         WHERE image_id = ?
         ORDER BY block_index`,
      )
      .all(imageId) as OcrBlockRow[];
  }

  saveImageOcr(
    imageId: number,
    blocks: Array<{
      text: string;
      bbox: { x: number; y: number; width: number; height: number };
      polygon?: [[number, number], [number, number], [number, number], [number, number]];
      confidence: number;
    }>,
    stamp?: OcrJobStamp,
  ): boolean {
    const now = Date.now();
    const txn = this.db.transaction((): boolean => {
      if (stamp && !this.isUnchanged(imageId, stamp)) return false;
      this.db.prepare('DELETE FROM image_ocr WHERE image_id = ?').run(imageId);
      const insert = this.db.prepare(
        `INSERT INTO image_ocr
           (image_id, block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        insert.run(
          imageId,
          index,
          block.text,
          block.bbox.x,
          block.bbox.y,
          block.bbox.width,
          block.bbox.height,
          block.polygon ? JSON.stringify(block.polygon) : null,
          block.confidence,
        );
      }
      this.db
        .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
        .run(blocks.length === 0 ? 'empty' : 'done', now, imageId);
      return true;
    });
    return txn();
  }

  markOcrError(imageId: number, message: string, stamp?: OcrJobStamp): boolean {
    const short = message.length > 200 ? message.slice(0, 200) : message;
    return this.db.transaction((): boolean => {
      if (stamp && !this.isUnchanged(imageId, stamp)) return false;
      this.db
        .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
        .run(`error:${short}`, Date.now(), imageId);
      return true;
    })();
  }
}
