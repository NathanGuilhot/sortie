import { DatabaseManager } from './db';
import kmeans from 'kmeans-ts';
import { LRUCache } from 'lru-cache';
import { EmbeddingRow, Tag, DismissedSuggestion } from 'shared';

export interface TagSuggestion {
  tagId: number;
  tagName: string;
  confidence: number;
  source: 'cluster' | 'similarity';
}

export interface ClusterResult {
  clusterId: number;
  centroid: number[];
  imageIds: number[];
  suggestedTags: TagSuggestion[];
}

export class SuggestionEngine {
  private db: DatabaseManager;
  private embeddingCache: LRUCache<number, number[]>;

  constructor(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
    this.embeddingCache = new LRUCache({ max: 1000 });
  }

  async getAllEmbeddings(): Promise<EmbeddingRow[]> {
    return this.db.getAllEmbeddings();
  }

  async getEmbedding(imageId: number): Promise<number[]> {
    const cached = this.embeddingCache.get(imageId);
    if (cached) return cached;
    const db = this.db.getDatabase();
    const row = db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as
      | { embedding: string }
      | undefined;
    if (!row) return [];
    const embedding = JSON.parse(row.embedding) as number[];
    this.embeddingCache.set(imageId, embedding);
    return embedding;
  }

  getImageTags(imageId: number): Tag[] {
    const rows = this.db.getImageTags(imageId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as Tag['category'],
      color: row.color,
      created_at: row.created_at,
    }));
  }

  getDismissedSuggestions(imageId: number): DismissedSuggestion[] {
    const rows = this.db.getDismissedSuggestions(imageId);
    return rows.map((row) => ({
      image_id: row.image_id,
      tag_id: row.tag_id,
      dismissed_at: row.dismissed_at,
    }));
  }

  dismissSuggestion(imageId: number, tagId: number): void {
    this.db.dismissSuggestion(imageId, tagId);
  }

  clearDismissedSuggestions(imageId: number): void {
    const db = this.db.getDatabase();
    db.prepare('DELETE FROM dismissed_suggestions WHERE image_id = ?').run(imageId);
  }

  getAllTags(): Tag[] {
    const rows = this.db.getAllTags();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as Tag['category'],
      color: row.color,
      created_at: row.created_at,
    }));
  }

  /**
   * Compute k-means clustering on embeddings.
   * If k is not provided, auto-selects using sqrt(n/2) capped between 2 and 20.
   */
  clusterEmbeddings(embeddings: number[][], k?: number): number[] {
    const n = embeddings.length;
    if (n === 0) return [];
    if (!k) {
      k = Math.max(2, Math.min(20, Math.floor(Math.sqrt(n / 2))));
    }
    const result = kmeans(embeddings, k) as { indexes: number[] };
    return result.indexes;
  }

  computeCentroids(embeddings: number[][], assignments: number[]): number[][] {
    const k = Math.max(...assignments) + 1;
    const dim = embeddings[0].length;
    const sums: number[][] = Array.from({ length: k }, () =>
      Array.from<number>({ length: dim }).fill(0),
    );
    const counts: number[] = Array.from<number>({ length: k }).fill(0);
    for (let i = 0; i < embeddings.length; i++) {
      const cluster = assignments[i];
      counts[cluster]++;
      for (let d = 0; d < dim; d++) {
        sums[cluster][d] += embeddings[i][d];
      }
    }
    const centroids: number[][] = [];
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        centroids.push(Array.from<number>({ length: dim }).fill(0));
      } else {
        centroids.push(sums[c].map((val) => val / counts[c]));
      }
    }
    return centroids;
  }

  /**
   * Generate tag suggestions based on clustering.
   * For each image, suggests tags that appear in 2+ other images in the same cluster
   * but aren't already assigned or dismissed.
   */
  generateSuggestions(
    imageIds: number[],
    _embeddings: number[][],
    assignments: number[],
  ): Map<number, TagSuggestion[]> {
    const k = Math.max(...assignments) + 1;
    const clusterImages: number[][] = Array.from({ length: k }, () => [] as number[]);
    for (let i = 0; i < imageIds.length; i++) {
      const cluster = assignments[i];
      clusterImages[cluster].push(imageIds[i]);
    }

    const clusterTags: Map<number, Map<number, number>> = new Map();
    for (let c = 0; c < k; c++) {
      const tagCounts = new Map<number, number>();
      for (const imageId of clusterImages[c]) {
        const tags = this.getImageTags(imageId);
        for (const tag of tags) {
          tagCounts.set(tag.id, (tagCounts.get(tag.id) || 0) + 1);
        }
      }
      clusterTags.set(c, tagCounts);
    }

    const suggestions = new Map<number, TagSuggestion[]>();
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      const cluster = assignments[i];
      const tagCounts = clusterTags.get(cluster)!;
      const imageTags = this.getImageTags(imageId).map((t) => t.id);
      const dismissed = this.getDismissedSuggestions(imageId).map((d) => d.tag_id);

      const candidateTags: TagSuggestion[] = [];
      for (const [tagId, count] of tagCounts) {
        if (count >= 2 && !imageTags.includes(tagId) && !dismissed.includes(tagId)) {
          const tag = this.getAllTags().find((t) => t.id === tagId);
          if (tag) {
            candidateTags.push({
              tagId,
              tagName: tag.name,
              confidence: count / clusterImages[cluster].length,
              source: 'cluster',
            });
          }
        }
      }
      candidateTags.sort((a, b) => b.confidence - a.confidence);
      suggestions.set(imageId, candidateTags.slice(0, 5));
    }
    return suggestions;
  }

  async generateAllSuggestions(): Promise<Map<number, TagSuggestion[]>> {
    const embeddingsRows = await this.getAllEmbeddings();
    if (embeddingsRows.length === 0) {
      return new Map();
    }
    const imageIds = embeddingsRows.map((row) => row.rowid);
    const embeddings = embeddingsRows.map((row) => row.embedding);
    const assignments = this.clusterEmbeddings(embeddings);
    return this.generateSuggestions(imageIds, embeddings, assignments);
  }

  /**
   * Generate suggestions for a single image using k-NN:
   * finds the topK most similar images and suggests their tags.
   */
  async generateSuggestionsForImage(imageId: number, topK: number = 10): Promise<TagSuggestion[]> {
    const targetEmbedding = await this.getEmbedding(imageId);
    if (targetEmbedding.length === 0) return [];

    const allRows = await this.getAllEmbeddings();
    const otherRows = allRows.filter((row) => row.rowid !== imageId);
    if (otherRows.length === 0) return [];

    const similarities: { imageId: number; similarity: number }[] = [];
    for (const row of otherRows) {
      const sim = this.cosineSimilarity(targetEmbedding, row.embedding);
      similarities.push({ imageId: row.rowid, similarity: sim });
    }
    similarities.sort((a, b) => b.similarity - a.similarity);
    const nearest = similarities.slice(0, topK);

    const tagCounts = new Map<number, number>();
    for (const { imageId: neighborId } of nearest) {
      const tags = this.getImageTags(neighborId);
      for (const tag of tags) {
        tagCounts.set(tag.id, (tagCounts.get(tag.id) || 0) + 1);
      }
    }

    const imageTags = this.getImageTags(imageId).map((t) => t.id);
    const dismissed = this.getDismissedSuggestions(imageId).map((d) => d.tag_id);
    const allTags = this.getAllTags();
    const candidates: TagSuggestion[] = [];
    for (const [tagId, count] of tagCounts) {
      if (!imageTags.includes(tagId) && !dismissed.includes(tagId)) {
        const tag = allTags.find((t) => t.id === tagId);
        if (tag) {
          candidates.push({
            tagId,
            tagName: tag.name,
            confidence: count / nearest.length,
            source: 'similarity',
          });
        }
      }
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, 5);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  close() {
    this.db.close();
  }
}
