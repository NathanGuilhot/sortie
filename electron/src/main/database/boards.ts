import type { DatabaseManager, SuggestionEngine } from 'pipeline';
import { DEFAULT_TAG_COLOR, type Board, type Image } from 'shared';

interface DatabaseBoardsDeps {
  requireDb(): DatabaseManager;
  fetchImagesByIdsInOrder(ids: number[]): Image[];
  invalidateMetadataCaches(): void;
  getSuggestionEngine(): SuggestionEngine;
}

export class DatabaseBoardsService {
  constructor(private readonly deps: DatabaseBoardsDeps) {}

  private queryBoards(extraWhere: string = '', params: readonly number[] = []): Board[] {
    const rows = this.deps
      .requireDb()
      .getDatabase()
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
      .all(...params) as Array<{
      id: number;
      name: string;
      color: string;
      image_count: number;
      cover_image_id: number | null;
      cover_image_path: string | null;
      preview_paths_json: string | null;
    }>;

    return rows.map((row) => {
      const { preview_paths_json, ...rest } = row;
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
      return { ...rest, preview_image_paths };
    });
  }

  async getBoards(): Promise<Board[]> {
    return this.queryBoards();
  }

  async getBoard(tagId: number): Promise<Board | null> {
    return this.queryBoards('t.id = ?', [tagId])[0] ?? null;
  }

  async getBoardImages(tagId: number, limit: number = 100, offset: number = 0): Promise<Image[]> {
    const rows = this.deps
      .requireDb()
      .getDatabase()
      .prepare(
        `SELECT i.id AS id
         FROM images i
         INNER JOIN image_tags it ON i.id = it.image_id
         WHERE it.tag_id = ? AND i.hidden = 0 AND i.missing = 0
         ORDER BY COALESCE(it.position, 1000000000), it.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(tagId, limit, offset) as Array<{ id: number }>;

    return this.deps.fetchImagesByIdsInOrder(rows.map((row) => row.id));
  }

  async reorderBoardImages(tagId: number, orderedImageIds: number[]): Promise<void> {
    const db = this.deps.requireDb().getDatabase();
    const stmt = db.prepare(`UPDATE image_tags SET position = ? WHERE tag_id = ? AND image_id = ?`);
    const txn = db.transaction(() => {
      orderedImageIds.forEach((imageId, index) => {
        stmt.run(index, tagId, imageId);
      });
    });
    txn();
    this.deps.invalidateMetadataCaches();
  }

  async getBoardImageSuggestions(tagId: number): Promise<Image[]> {
    const suggestions = await this.deps
      .getSuggestionEngine()
      .generateImageSuggestionsForBoard(tagId, 20);
    if (suggestions.length === 0) return [];
    return this.deps.fetchImagesByIdsInOrder(suggestions.map((suggestion) => suggestion.imageId));
  }

  async addImageToBoard(imageId: number, tagId: number): Promise<void> {
    const db = this.deps.requireDb().getDatabase();
    const txn = db.transaction(() => {
      const { next } = db
        .prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?`)
        .get(tagId) as { next: number };
      db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, position)
         VALUES (?, ?, 'user', ?)`,
      ).run(imageId, tagId, next);
    });
    txn();
    this.deps.invalidateMetadataCaches();
  }

  async removeImageFromBoard(imageId: number, tagId: number): Promise<void> {
    this.deps
      .requireDb()
      .getDatabase()
      .prepare(`DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?`)
      .run(imageId, tagId);
    this.deps.invalidateMetadataCaches();
  }

  async createBoard(name: string, color?: string): Promise<Board> {
    const db = this.deps.requireDb().getDatabase();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');

    db.prepare(
      `INSERT INTO tags (name, category, color) VALUES (?, 'user', COALESCE(?, '${DEFAULT_TAG_COLOR}'))
       ON CONFLICT(name) DO UPDATE SET category = COALESCE(tags.category, 'user')`,
    ).run(trimmed, color ?? null);

    const row = db.prepare(`SELECT id, name, color FROM tags WHERE name = ?`).get(trimmed) as {
      id: number;
      name: string;
      color: string;
    };

    return {
      ...row,
      image_count: 0,
      cover_image_id: null,
      cover_image_path: null,
      preview_image_paths: [],
    };
  }

  async renameBoard(tagId: number, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Board name cannot be empty');
    this.deps.requireDb().renameTag(tagId, trimmed);
    this.deps.invalidateMetadataCaches();
  }

  async setBoardColor(tagId: number, color: string): Promise<void> {
    this.deps.requireDb().setTagColor(tagId, color);
  }

  async deleteBoard(tagId: number): Promise<void> {
    this.deps.requireDb().deleteTag(tagId);
    this.deps.invalidateMetadataCaches();
  }
}
