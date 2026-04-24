import type Database from 'better-sqlite3';
import type { Tag } from 'shared';

export interface TagDbRow {
  id: number;
  name: string;
  category: string;
  color: string;
  created_at: string;
}

export interface DismissedDbRow {
  image_id: number;
  tag_id: number;
  dismissed_at: string;
}

export class DatabaseTagRepository {
  constructor(private readonly db: Database.Database) {}

  getImageTags(imageId: number): TagDbRow[] {
    return this.db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN image_tags it ON t.id = it.tag_id
         WHERE it.image_id = ?`,
      )
      .all(imageId) as TagDbRow[];
  }

  getDismissedSuggestions(imageId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE image_id = ?')
      .all(imageId) as DismissedDbRow[];
  }

  getDismissedSuggestionsByTag(tagId: number): DismissedDbRow[] {
    return this.db
      .prepare('SELECT * FROM dismissed_suggestions WHERE tag_id = ?')
      .all(tagId) as DismissedDbRow[];
  }

  getBoardImageIds(tagId: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT it.image_id AS image_id
         FROM image_tags it
         INNER JOIN images img ON img.id = it.image_id
         WHERE it.tag_id = ? AND img.hidden = 0 AND img.missing = 0`,
      )
      .all(tagId) as Array<{ image_id: number }>;
    return rows.map((row) => row.image_id);
  }

  dismissSuggestion(imageId: number, tagId: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO dismissed_suggestions (image_id, tag_id)
         VALUES (?, ?)`,
      )
      .run(imageId, tagId);
  }

  getAllTags(): TagDbRow[] {
    return this.db.prepare('SELECT * FROM tags').all() as TagDbRow[];
  }

  getTagsWithCounts(): Array<TagDbRow & { usage_count: number }> {
    return this.db
      .prepare(
        `SELECT t.*, COUNT(it.image_id) AS usage_count
         FROM tags t
         LEFT JOIN image_tags it ON t.id = it.tag_id
         GROUP BY t.id
         ORDER BY usage_count DESC`,
      )
      .all() as Array<TagDbRow & { usage_count: number }>;
  }

  renameTag(tagId: number, name: string): void {
    this.db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, tagId);
  }

  setTagColor(tagId: number, color: string): void {
    this.db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, tagId);
  }

  deleteTag(tagId: number): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
  }

  updateImageMetadata(
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
      website_link?: string | null;
    },
  ): void {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (metadata.description !== undefined) {
      fields.push('description = ?');
      values.push(metadata.description);
    }
    if (metadata.favorite !== undefined) {
      fields.push('favorite = ?');
      values.push(metadata.favorite ? 1 : 0);
    }
    if (metadata.captured_at !== undefined) {
      fields.push('captured_at = ?');
      values.push(metadata.captured_at);
    }
    if (metadata.city !== undefined) {
      fields.push('city = ?');
      values.push(metadata.city);
    }
    if (metadata.country !== undefined) {
      fields.push('country = ?');
      values.push(metadata.country);
    }
    if (metadata.website_link !== undefined) {
      fields.push('website_link = ?');
      values.push(metadata.website_link);
    }

    if (fields.length === 0) return;

    fields.push("modified_at = datetime('now')");
    values.push(imageId);
    this.db.prepare(`UPDATE images SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
}
