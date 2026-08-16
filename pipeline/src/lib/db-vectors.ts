import type Database from 'better-sqlite3';
import { visibleImageSql } from './db-visibility';
import { decodeEmbeddingRows, decodeEmbeddingValue, type EmbeddingRowValue } from './embedding';
import type { VecMatchRow } from './db-people';

interface EmbeddingDbRow extends EmbeddingRowValue {
  rowid: number;
}

export class DatabaseVectorRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly vecLoaded: boolean,
  ) {}

  insertEmbedding(rowid: number, embedding: number[]): void {
    if (!this.vecLoaded) return;
    this.db.prepare('DELETE FROM vec_images WHERE rowid = ?').run(BigInt(rowid));
    this.db
      .prepare('INSERT INTO vec_images (rowid, embedding) VALUES (?, ?)')
      .run(BigInt(rowid), new Float32Array(embedding));
  }

  getVisibleEmbeddings(): Array<{ rowid: number; embedding: number[] }> {
    if (!this.vecLoaded) return [];
    return decodeEmbeddingRows(
      this.db
        .prepare(
          `SELECT v.rowid AS rowid, v.embedding AS embedding
           FROM vec_images v
           JOIN images img ON img.id = v.rowid
           WHERE ${visibleImageSql('img')}`,
        )
        .all() as EmbeddingDbRow[],
    );
  }

  getEmbedding(imageId: number): number[] | null {
    if (!this.vecLoaded) return null;
    const row = this.db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as
      | { embedding: EmbeddingDbRow['embedding'] }
      | undefined;
    if (!row) return null;
    return decodeEmbeddingValue(row.embedding);
  }

  findNearestImageMatches(embedding: number[], limit: number): VecMatchRow[] {
    if (!this.vecLoaded) return [];
    return this.db
      .prepare(
        `SELECT rowid, distance FROM vec_images
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance`,
      )
      .all(new Float32Array(embedding), limit) as VecMatchRow[];
  }

  findNearestVisibleImages(embedding: number[], k: number, maxDistance: number): VecMatchRow[] {
    if (!this.vecLoaded) return [];
    return this.db
      .prepare(
        `SELECT sub.rowid, sub.distance
         FROM (
           SELECT v.rowid, v.distance
           FROM vec_images v
           WHERE v.embedding MATCH ? AND k = ?
         ) sub
         INNER JOIN images i ON i.id = sub.rowid AND ${visibleImageSql('i')}
         WHERE sub.distance < ?
         ORDER BY sub.distance`,
      )
      .all(new Float32Array(embedding), k, maxDistance) as VecMatchRow[];
  }
}
