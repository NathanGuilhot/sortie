import { DatabaseManager } from './db';
import kmeans from 'kmeans-ts';
import { LRUCache } from 'lru-cache';
import { EmbeddingRow, Tag, ImageTag, DismissedSuggestion } from 'shared';

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
  private tagEmbeddingCache: LRUCache<string, number[]>;

  constructor(dbPath: string) {
    this.db = new DatabaseManager(dbPath);
    this.db.createSuggestionIndexes();
    this.embeddingCache = new LRUCache({ max: 1000 });
    this.tagEmbeddingCache = new LRUCache({ max: 500 });
  }

  /**
   * Get all image embeddings from the database
   * Returns array of { imageId, embedding }
   */
  async getAllEmbeddings(): Promise<EmbeddingRow[]> {
    return this.db.getAllEmbeddings();
  }

  /**
   * Get embeddings with LRU caching
   */
  async getEmbedding(imageId: number): Promise<number[]> {
    const cached = this.embeddingCache.get(imageId);
    if (cached) return cached;
    const db = this.db.getDatabase();
    const row = db.prepare('SELECT embedding FROM vec_images WHERE rowid = ?').get(imageId) as any;
    if (!row) return [];
    const embedding = JSON.parse(row.embedding);
    this.embeddingCache.set(imageId, embedding);
    return embedding;
  }

  /**
   * Get tags for a given image (already assigned)
   */
  getImageTags(imageId: number): Tag[] {
    const rows = this.db.getImageTags(imageId);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category as any,
      color: row.color,
      created_at: row.created_at
    }));
  }

  /**
   * Get dismissed suggestions for an image
   */
  getDismissedSuggestions(imageId: number): DismissedSuggestion[] {
    const rows = this.db.getDismissedSuggestions(imageId);
    return rows.map(row => ({
      image_id: row.image_id,
      tag_id: row.tag_id,
      dismissed_at: row.dismissed_at
    }));
  }

  /**
   * Dismiss a suggestion for an image
   */
  dismissSuggestion(imageId: number, tagId: number): void {
    this.db.dismissSuggestion(imageId, tagId);
  }

  /**
   * Clear dismissed suggestions for an image (optional)
   */
  clearDismissedSuggestions(imageId: number): void {
    const db = this.db.getDatabase();
    db.prepare('DELETE FROM dismissed_suggestions WHERE image_id = ?').run(imageId);
  }

  /**
   * Get all tags from database
   */
  getAllTags(): Tag[] {
    const rows = this.db.getAllTags();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      category: row.category as any,
      color: row.color,
      created_at: row.created_at
    }));
  }

  /**
   * Compute k-means clustering on embeddings
   * @param embeddings array of embeddings
   * @param k number of clusters (if not provided, auto-select)
   * @returns cluster assignments array where index corresponds to input embeddings
   */
  clusterEmbeddings(embeddings: number[][], k?: number): number[] {
    const n = embeddings.length;
    if (n === 0) return [];
    if (!k) {
      // simple heuristic: sqrt(n/2) capped between 2 and 20
      k = Math.max(2, Math.min(20, Math.floor(Math.sqrt(n / 2))));
    }
    const result = kmeans(embeddings, k);
    return result.indexes;
  }

  /**
   * Compute centroids for each cluster
   */
  computeCentroids(embeddings: number[][], assignments: number[]): number[][] {
    const k = Math.max(...assignments) + 1;
    const dim = embeddings[0].length;
    const sums: number[][] = Array(k).fill(null).map(() => Array(dim).fill(0));
    const counts: number[] = Array(k).fill(0);
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
        centroids.push(Array(dim).fill(0));
      } else {
        centroids.push(sums[c].map(val => val / counts[c]));
      }
    }
    return centroids;
  }

  /**
   * Generate tag suggestions based on clustering
   * @param imageIds array of image IDs corresponding to embeddings
   * @param embeddings array of embeddings for each image
   * @param assignments cluster assignments for each image
   * @returns map from imageId to suggested tags
   */
  generateSuggestions(
    imageIds: number[],
    embeddings: number[][],
    assignments: number[]
  ): Map<number, TagSuggestion[]> {
    const k = Math.max(...assignments) + 1;
    // Group image IDs by cluster
    const clusterImages: number[][] = Array(k).fill(null).map(() => []);
    for (let i = 0; i < imageIds.length; i++) {
      const cluster = assignments[i];
      clusterImages[cluster].push(imageIds[i]);
    }

    // For each cluster, find tags already present in cluster
    const clusterTags: Map<number, Map<number, number>> = new Map(); // cluster -> tagId -> count
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

    // For each image, suggest tags from its cluster that are not already assigned and not dismissed
    const suggestions = new Map<number, TagSuggestion[]>();
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      const cluster = assignments[i];
      const tagCounts = clusterTags.get(cluster)!;
      const imageTags = this.getImageTags(imageId).map(t => t.id);
      const dismissed = this.getDismissedSuggestions(imageId).map(d => d.tag_id);

      // Filter tags: not already assigned, not dismissed, and appears in at least 2 images in cluster
      const candidateTags: TagSuggestion[] = [];
      const entries = Array.from(tagCounts.entries());
      for (const [tagId, count] of entries) {
        if (count >= 2 && !imageTags.includes(tagId) && !dismissed.includes(tagId)) {
          // Need to get tag name
          const tag = this.getAllTags().find(t => t.id === tagId);
          if (tag) {
            candidateTags.push({
              tagId,
              tagName: tag.name,
              confidence: count / clusterImages[cluster].length, // proportion of cluster with tag
              source: 'cluster'
            });
          }
        }
      }
      // Sort by confidence descending
      candidateTags.sort((a, b) => b.confidence - a.confidence);
      suggestions.set(imageId, candidateTags.slice(0, 5)); // top 5
    }
    return suggestions;
  }

  /**
   * Main entry point: generate suggestions for all images in database
   */
  async generateAllSuggestions(): Promise<Map<number, TagSuggestion[]>> {
    const embeddingsRows = await this.getAllEmbeddings();
    if (embeddingsRows.length === 0) {
      return new Map();
    }
    const imageIds = embeddingsRows.map(row => row.rowid);
    const embeddings = embeddingsRows.map(row => row.embedding);
    const assignments = this.clusterEmbeddings(embeddings);
    return this.generateSuggestions(imageIds, embeddings, assignments);
  }

  /**
   * Generate suggestions for a single image (find similar images via kNN)
   */
  async generateSuggestionsForImage(imageId: number, topK: number = 10): Promise<TagSuggestion[]> {
    const targetEmbedding = await this.getEmbedding(imageId);
    if (targetEmbedding.length === 0) return [];

    // Get all other embeddings
    const allRows = await this.getAllEmbeddings();
    const otherRows = allRows.filter(row => row.rowid !== imageId);
    if (otherRows.length === 0) return [];

    // Compute cosine similarities
    const similarities: { imageId: number, similarity: number }[] = [];
    for (const row of otherRows) {
      const sim = this.cosineSimilarity(targetEmbedding, row.embedding);
      similarities.push({ imageId: row.rowid, similarity: sim });
    }
    similarities.sort((a, b) => b.similarity - a.similarity);
    const nearest = similarities.slice(0, topK);

    // Collect tags from nearest neighbors
    const tagCounts = new Map<number, number>();
    for (const { imageId: neighborId } of nearest) {
      const tags = this.getImageTags(neighborId);
      for (const tag of tags) {
        tagCounts.set(tag.id, (tagCounts.get(tag.id) || 0) + 1);
      }
    }

    const imageTags = this.getImageTags(imageId).map(t => t.id);
    const dismissed = this.getDismissedSuggestions(imageId).map(d => d.tag_id);
    const allTags = this.getAllTags();
    const candidates: TagSuggestion[] = [];
    const entries = Array.from(tagCounts.entries());
    for (const [tagId, count] of entries) {
      if (!imageTags.includes(tagId) && !dismissed.includes(tagId)) {
        const tag = allTags.find(t => t.id === tagId);
        if (tag) {
          candidates.push({
            tagId,
            tagName: tag.name,
            confidence: count / nearest.length,
            source: 'similarity'
          });
        }
      }
    }
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates.slice(0, 5);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
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