import { DatabaseManager } from './db';
import { SuggestionEngine } from './suggestions';
import { Collection } from 'shared';

export class Organizer {
  private db: DatabaseManager;
  private suggestions: SuggestionEngine;

  constructor(db: DatabaseManager, suggestions: SuggestionEngine) {
    this.db = db;
    this.suggestions = suggestions;
  }

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

  getAllCollections(): Collection[] {
    const db = this.db.getDatabase();
    return db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all() as Collection[];
  }

  createCollection(name: string, description?: string): number {
    const db = this.db.getDatabase();
    const stmt = db.prepare(
      'INSERT INTO collections (name, description, cluster_id) VALUES (?, ?, NULL)',
    );
    const result = stmt.run(name, description || null);
    return result.lastInsertRowid as number;
  }
}
