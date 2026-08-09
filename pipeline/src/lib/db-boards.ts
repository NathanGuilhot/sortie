import type Database from 'better-sqlite3';
import { DEFAULT_TAG_COLOR, type Board } from 'shared';

interface BoardDbRow {
  id: number;
  name: string;
  color: string;
  image_count: number;
  cover_image_id: number | null;
  cover_image_path: string | null;
  preview_paths_json: string | null;
}

export class DatabaseBoardRepository {
  constructor(private readonly db: Database.Database) {}

  listBoards(): Board[] {
    return this.queryBoards();
  }

  getBoard(tagId: number): Board | null {
    return this.queryBoards('t.id = ?', [tagId])[0] ?? null;
  }

  getBoardImageIdsPaged(tagId: number, limit: number, offset: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT i.id AS id
         FROM images i
         INNER JOIN image_tags it ON i.id = it.image_id
         WHERE it.tag_id = ? AND i.hidden = 0 AND i.missing = 0
         ORDER BY COALESCE(it.position, 1000000000), it.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(tagId, limit, offset) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

  reorderBoardImages(tagId: number, orderedImageIds: number[]): void {
    const updatePosition = this.db.prepare(
      'UPDATE image_tags SET position = ? WHERE tag_id = ? AND image_id = ?',
    );
    this.db.transaction(() => {
      orderedImageIds.forEach((imageId, index) => {
        updatePosition.run(index, tagId, imageId);
      });
    })();
  }

  addImagesToBoard(imageIds: number[], tagId: number): void {
    const uniqueImageIds = Array.from(new Set(imageIds));
    if (uniqueImageIds.length === 0) return;

    this.db.transaction(() => {
      const { next } = this.db
        .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?')
        .get(tagId) as { next: number };
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, position)
         VALUES (?, ?, 'user', ?)`,
      );
      uniqueImageIds.forEach((imageId, index) => {
        insert.run(imageId, tagId, next + index);
      });
    })();
  }

  removeImageFromBoard(imageId: number, tagId: number): void {
    this.db.prepare('DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?').run(imageId, tagId);
  }

  createBoard(name: string, color?: string): { id: number; name: string; color: string } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');

    this.db
      .prepare(
        `INSERT INTO tags (name, category, color) VALUES (?, 'user', COALESCE(?, '${DEFAULT_TAG_COLOR}'))
         ON CONFLICT(name) DO UPDATE SET category = COALESCE(tags.category, 'user')`,
      )
      .run(trimmed, color ?? null);

    return this.db.prepare('SELECT id, name, color FROM tags WHERE name = ?').get(trimmed) as {
      id: number;
      name: string;
      color: string;
    };
  }

  private queryBoards(extraWhere = '', params: readonly number[] = []): Board[] {
    const rows = this.db
      .prepare(
        `WITH cover AS (
           SELECT it.tag_id, it.image_id, img.file_path,
                  ROW_NUMBER() OVER (
                    PARTITION BY it.tag_id
                    ORDER BY COALESCE(it.position, 1000000000), it.created_at DESC
                  ) AS rn
           FROM image_tags it
           INNER JOIN images img ON img.id = it.image_id
           WHERE img.hidden = 0 AND img.missing = 0
         ),
         previews AS (
           SELECT tag_id, json_group_array(file_path) AS paths
           FROM (
             SELECT tag_id, file_path, rn FROM cover WHERE rn <= 4 ORDER BY tag_id, rn
           )
           GROUP BY tag_id
         )
         SELECT
           t.id,
           t.name,
           t.color,
           COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS image_count,
           (SELECT c.image_id FROM cover c WHERE c.tag_id = t.id AND c.rn = 1) AS cover_image_id,
           (SELECT c.file_path FROM cover c WHERE c.tag_id = t.id AND c.rn = 1) AS cover_image_path,
           (SELECT p.paths FROM previews p WHERE p.tag_id = t.id) AS preview_paths_json
         FROM tags t
         LEFT JOIN image_tags it ON t.id = it.tag_id
         LEFT JOIN images i ON i.id = it.image_id AND i.hidden = 0 AND i.missing = 0
         WHERE t.category IN ('user', 'ai')${extraWhere ? ` AND ${extraWhere}` : ''}
         GROUP BY t.id
         ORDER BY image_count DESC, t.name ASC`,
      )
      .all(...params) as BoardDbRow[];

    return rows.map((row) => {
      const { preview_paths_json, ...board } = row;
      let preview_image_paths: string[] = [];
      if (preview_paths_json) {
        try {
          const parsed: unknown = JSON.parse(preview_paths_json);
          if (Array.isArray(parsed)) {
            preview_image_paths = parsed.filter(
              (value): value is string => typeof value === 'string',
            );
          }
        } catch {
          preview_image_paths = [];
        }
      }
      return { ...board, preview_image_paths };
    });
  }
}
