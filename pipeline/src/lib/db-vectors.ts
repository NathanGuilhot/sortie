import type Database from 'better-sqlite3';
import { decodeEmbeddingRows, decodeEmbeddingValue, type EmbeddingRowValue } from './embedding';
import type { VecMatchRow } from './db-people';

interface EmbeddingDbRow extends EmbeddingRowValue {
  rowid: number;
}

export class DatabaseVectorRepository {
  constructor(private readonly db: Database.Database) {}

  insertEmbedding(rowid: number, embedding: number[]): void {
    this.db.prepare('DELETE FROM vec_images WHERE rowid = ?').run(BigInt(rowid));
    this.db
      .prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(rowid), new Float32Array(embedding));
  }

  getVisibleEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    return decodeEmbeddingRows(
      this.db
        .prepare(
          `SELECT v.rowid AS rowid, v.embedding AS embedding
           FROM vec_images v
           JOIN images img ON img.id = v.rowid
           WHERE img.hidden = 0 AND img.missing = 0`,
        )
        .all() as EmbeddingDbRow[],
    );
  }

  getEmbedding(imageId: number): number[] | null {
    const row = this.db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as
      | { embedding: EmbeddingDbRow['embedding'] }
      | undefined;
    if (!row) return null;
    return decodeEmbeddingValue(row.embedding);
  }

  findNearestImageMatches(embedding: number[], limit: number): VecMatchRow[] {
    return this.db
      .prepare(
        `SELECT rowid, distance FROM vec_images
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(new Float32Array(embedding), limit) as VecMatchRow[];
  }
}
