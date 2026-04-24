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

    for (let c = 0; c < k; c++) {
      const clusterImageIds = imageIds.filter((_, idx) => assignments[idx] === c);
      if (clusterImageIds.length === 0) continue;

      const name = `${collectionNamePrefix} ${c + 1}`;
      const description = `Automatically created from cluster ${c + 1} containing ${clusterImageIds.length} images`;
      const collectionId = this.db.createCollection(name, description, c);
      createdIds.push(collectionId);
      this.db.addImagesToCollection(collectionId, clusterImageIds);
    }
    return createdIds;
  }

  getAllCollections(): Collection[] {
    return this.db.getCollections();
  }

  createCollection(name: string, description?: string): number {
    return this.db.createCollection(name, description || null, null);
  }
}
