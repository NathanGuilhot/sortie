import { DatabaseManager } from './db';
import { SuggestionEngine } from './suggestions';

export interface Collection {
  id: number;
  name: string;
  description: string | null;
  cluster_id: number | null;
  created_at: string;
}

export interface CollectionImage {
  collection_id: number;
  image_id: number;
  added_at: string;
}

interface CollectionDbRow {
  id: number;
  name: string;
  description: string | null;
  cluster_id: number | null;
  created_at: string;
}

export class Organizer {
  private db: DatabaseManager;
  private suggestions: SuggestionEngine;

  constructor(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
    this.suggestions = new SuggestionEngine(dbPath);
  }

  /**
   * Create collections based on clustering of image embeddings.
   * @param collectionNamePrefix prefix for auto-generated collection names (default "Cluster")
   */
  async createCollectionsFromClusters(collectionNamePrefix = 'Cluster'): Promise<number[]> {
    const embeddingsRows = await this.suggestions.getAllEmbeddings();
    if (embeddingsRows.length === 0) {
      return [];
    }
    const imageIds = embeddingsRows.map((row) => row.rowid);
    const embeddings = embeddingsRows.map((row) => row.embedding);
    const assignments = this.suggestions.clusterEmbeddings(embeddings);
    const k = Math.max(...assignments) + 1;

    const createdIds: number[] = [];
    const db = this.db.getDatabase();

    for (let c = 0; c < k; c++) {
      const clusterImageIds = imageIds.filter((_, idx) => assignments[idx] === c);
      if (clusterImageIds.length === 0) continue;

      const name = `${collectionNamePrefix} ${c + 1}`;
      const description = `Automatically created from cluster ${c + 1} containing ${clusterImageIds.length} images`;

      const insert = db.prepare(`
        INSERT INTO collections (name, description, cluster_id)
        VALUES (?, ?, ?)
      `);
      const result = insert.run(name, description, c);
      const collectionId = result.lastInsertRowid as number;
      createdIds.push(collectionId);

      const insertImage = db.prepare(`
        INSERT OR IGNORE INTO collection_images (collection_id, image_id)
        VALUES (?, ?)
      `);
      for (const imageId of clusterImageIds) {
        insertImage.run(collectionId, imageId);
      }
    }
    return createdIds;
  }

  getImageCollections(imageId: number): Collection[] {
    const db = this.db.getDatabase();
    return db
      .prepare(
        `
      SELECT c.* FROM collections c
      JOIN collection_images ci ON c.id = ci.collection_id
      WHERE ci.image_id = ?
    `,
      )
      .all(imageId) as CollectionDbRow[];
  }

  getAllCollections(): Collection[] {
    const db = this.db.getDatabase();
    return db
      .prepare('SELECT * FROM collections ORDER BY created_at DESC')
      .all() as CollectionDbRow[];
  }

  createCollection(name: string, description?: string): number {
    const db = this.db.getDatabase();
    const stmt = db.prepare(
      'INSERT INTO collections (name, description, cluster_id) VALUES (?, ?, NULL)',
    );
    const result = stmt.run(name, description || null);
    return result.lastInsertRowid as number;
  }

  getCollectionImages(collectionId: number): number[] {
    const db = this.db.getDatabase();
    const rows = db
      .prepare(
        `
      SELECT image_id FROM collection_images WHERE collection_id = ?
    `,
      )
      .all(collectionId) as Array<{ image_id: number }>;
    return rows.map((row) => row.image_id);
  }

  deleteCollection(collectionId: number): void {
    const db = this.db.getDatabase();
    db.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
  }

  addImageToCollection(collectionId: number, imageId: number): void {
    const db = this.db.getDatabase();
    db.prepare(
      `
      INSERT OR IGNORE INTO collection_images (collection_id, image_id)
      VALUES (?, ?)
    `,
    ).run(collectionId, imageId);
  }

  removeImageFromCollection(collectionId: number, imageId: number): void {
    const db = this.db.getDatabase();
    db.prepare(
      `
      DELETE FROM collection_images WHERE collection_id = ? AND image_id = ?
    `,
    ).run(collectionId, imageId);
  }
}
