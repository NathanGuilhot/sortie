import type Database from 'better-sqlite3';
import { visibleImageSql } from './db-visibility';
import { type PaletteColor, parseOptionalJson } from 'shared';

export class DatabasePaletteRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly vecLoaded: boolean,
  ) {}

  insertPalette(imageId: number, palette: PaletteColor[]): void {
    const transaction = this.db.transaction((colors: PaletteColor[]) => {
      const oldIds = this.db
        .prepare('SELECT id FROM palette_colors WHERE image_id = ?')
        .all(imageId) as Array<{ id: number }>;

      if (this.vecLoaded) {
        const deleteVector = this.db.prepare('DELETE FROM vec_palette WHERE rowid = ?');
        for (const { id } of oldIds) {
          deleteVector.run(BigInt(id));
        }
      }

      this.db.prepare('DELETE FROM palette_colors WHERE image_id = ?').run(imageId);

      const insertMeta = this.db.prepare(
        'INSERT INTO palette_colors (image_id, color_idx, weight) VALUES (?, ?, ?)',
      );
      const insertVector = this.vecLoaded
        ? this.db.prepare('INSERT INTO vec_palette (rowid, lab) VALUES (?, ?)')
        : null;

      for (let index = 0; index < colors.length; index++) {
        const color = colors[index];
        const result = insertMeta.run(imageId, index, color.weight);
        const rowid = result.lastInsertRowid as number;
        if (insertVector) {
          insertVector.run(BigInt(rowid), new Float32Array(color.lab));
        }
      }

      this.db
        .prepare('UPDATE images SET palette_json = ? WHERE id = ?')
        .run(JSON.stringify(colors), imageId);
    });

    transaction(palette);
  }

  getPalette(imageId: number): PaletteColor[] | null {
    const row = this.db.prepare('SELECT palette_json FROM images WHERE id = ?').get(imageId) as
      | { palette_json: string | null }
      | undefined;
    return parseOptionalJson<PaletteColor[]>(row?.palette_json);
  }

  getImagesMissingPalette(): Array<{ id: number; file_path: string }> {
    return this.db
      .prepare(
        `SELECT id, file_path FROM images
         WHERE palette_json IS NULL AND ${visibleImageSql()}`,
      )
      .all() as Array<{ id: number; file_path: string }>;
  }

  findImagesByColors(
    queryLabs: Array<[number, number, number]>,
    limit: number,
  ): Array<{ imageId: number; score: number }> {
    if (!this.vecLoaded || queryLabs.length === 0) return [];

    const perQueryK = Math.max(200, limit * 10);
    const perImageMin = new Map<number, number[]>();
    const queryDistance = this.db.prepare(`
      SELECT v.rowid, v.distance, pc.image_id
      FROM vec_palette v
      JOIN palette_colors pc ON pc.id = v.rowid
      JOIN images i ON i.id = pc.image_id
      WHERE v.lab MATCH ? AND k = ? AND ${visibleImageSql('i')}
      ORDER BY v.distance
    `);

    for (let queryIndex = 0; queryIndex < queryLabs.length; queryIndex++) {
      const rows = queryDistance.all(new Float32Array(queryLabs[queryIndex]), perQueryK) as Array<{
        rowid: number;
        distance: number;
        image_id: number;
      }>;

      const seen = new Set<number>();
      for (const row of rows) {
        if (seen.has(row.image_id)) continue;
        seen.add(row.image_id);

        let distances = perImageMin.get(row.image_id);
        if (!distances) {
          distances = new Array(queryLabs.length).fill(Infinity);
          perImageMin.set(row.image_id, distances);
        }

        distances[queryIndex] = row.distance;
      }
    }

    const aggregated: Array<{ imageId: number; score: number }> = [];
    for (const [imageId, distances] of perImageMin) {
      let score = 0;
      let complete = true;

      for (const distance of distances) {
        if (!Number.isFinite(distance)) {
          complete = false;
          break;
        }
        score += distance;
      }

      if (complete) {
        aggregated.push({ imageId, score });
      }
    }

    aggregated.sort((left, right) => left.score - right.score);
    return aggregated.slice(0, limit);
  }
}
