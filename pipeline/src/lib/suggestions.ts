import { DatabaseManager } from './db';
import { LRUCache } from 'lru-cache';
import { ImageSuggestion, Tag, DismissedSuggestion, TagSuggestion } from 'shared';

export class SuggestionEngine {
  private db: DatabaseManager;
  private embeddingCache: LRUCache<number, number[]>;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.embeddingCache = new LRUCache({ max: 1000 });
  }

  async getVisibleEmbeddings(): Promise<Array<{ rowid: number; embedding: number[] }>> {
    return this.db.getVisibleEmbeddings();
  }

  async getEmbedding(imageId: number): Promise<number[]> {
    const cached = this.embeddingCache.get(imageId);
    if (cached) return cached;
    const embedding = this.db.getEmbedding(imageId);
    if (!embedding) return [];
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

  async generateSuggestionsForImage(imageId: number, topK: number = 10): Promise<TagSuggestion[]> {
    const targetEmbedding = await this.getEmbedding(imageId);
    if (targetEmbedding.length === 0) return [];

    const allRows = await this.getVisibleEmbeddings();
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

  async generateImageSuggestionsForBoard(
    tagId: number,
    topK: number = 20,
  ): Promise<ImageSuggestion[]> {
    const boardImageIds = this.db.getBoardImageIds(tagId);
    if (boardImageIds.length === 0) return [];

    const boardEmbeddings: number[][] = [];
    for (const id of boardImageIds) {
      const emb = await this.getEmbedding(id);
      if (emb.length > 0) boardEmbeddings.push(emb);
    }
    if (boardEmbeddings.length === 0) return [];

    const dim = boardEmbeddings[0].length;
    const centroid = new Array<number>(dim).fill(0);
    for (const emb of boardEmbeddings) {
      for (let d = 0; d < dim; d++) centroid[d] += emb[d];
    }
    for (let d = 0; d < dim; d++) centroid[d] /= boardEmbeddings.length;

    const boardSet = new Set(boardImageIds);
    const dismissedSet = new Set(
      this.db.getDismissedSuggestionsByTag(tagId).map((r) => r.image_id),
    );

    const allRows = await this.getVisibleEmbeddings();
    const scored: ImageSuggestion[] = [];
    for (const row of allRows) {
      if (boardSet.has(row.rowid) || dismissedSet.has(row.rowid)) continue;
      const sim = this.cosineSimilarity(centroid, row.embedding);
      scored.push({ imageId: row.rowid, confidence: sim });
    }
    scored.sort((a, b) => b.confidence - a.confidence);
    return scored.slice(0, topK);
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
