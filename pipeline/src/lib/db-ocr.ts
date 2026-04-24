import type Database from 'better-sqlite3';
import type { OcrStatus } from 'shared';

export class DatabaseOcrRepository {
  constructor(private readonly db: Database.Database) {}

  getOcrStatus(imageId: number): { status: OcrStatus; at: number | null } {
    const row = this.db
      .prepare('SELECT ocr_status AS status, ocr_at AS at FROM images WHERE id = ?')
      .get(imageId) as { status: OcrStatus; at: number | null } | undefined;
    return row ?? { status: null, at: null };
  }

  getImageOcr(imageId: number): Array<{
    block_index: number;
    text: string;
    bbox_x: number;
    bbox_y: number;
    bbox_w: number;
    bbox_h: number;
    polygon_json: string | null;
    confidence: number;
  }> {
    return this.db
      .prepare(
        `SELECT block_index, text, bbox_x, bbox_y, bbox_w, bbox_h, polygon_json, confidence
         FROM image_ocr
         WHERE image_id = ?
         ORDER BY block_index`,
      )
      .all(imageId) as Array<{
      block_index: number;
      text: string;
      bbox_x: number;
      bbox_y: number;
      bbox_w: number;
      bbox_h: number;
      polygon_json: string | null;
      confidence: number;
    }>;
  }

  saveImageOcr(
    imageId: number,
    blocks: Array<{
      text: string;
      bbox: { x: number; y: number; width: number; height: number };
      polygon?: [[number, number], [number, number], [number, number], [number, number]];
      confidence: number;
    }>,
  ): void {
    const now = Date.now();
    const txn = this.db.transaction(() => {
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
    });
    txn();
  }

  markOcrError(imageId: number, message: string): void {
    const short = message.length > 200 ? message.slice(0, 200) : message;
    this.db
      .prepare('UPDATE images SET ocr_status = ?, ocr_at = ? WHERE id = ?')
      .run(`error:${short}`, Date.now(), imageId);
  }
}
