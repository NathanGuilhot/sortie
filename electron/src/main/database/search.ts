import { type ClipEmbedder, type DatabaseManager, hexToOklab } from 'pipeline';
import type { Query, SearchResult } from 'shared';

interface DatabaseSearchDeps {
  requireDb(): DatabaseManager;
  getEmbedder(): ClipEmbedder;
  getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[];
  fetchImagesByIdsInOrder(ids: number[]): ReturnType<DatabaseManager['images']['getImagesByIds']>;
}

export class DatabaseSearchService {
  constructor(private readonly deps: DatabaseSearchDeps) {}

  async queryImages(query: Query): Promise<SearchResult[]> {
    const db = this.deps.requireDb();
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    const hasText = !!query.text && query.text.trim().length > 0;
    const hasBytes = !!query.imageBytes && query.imageBytes.byteLength > 0;
    const hasPalette = !!query.palette && query.palette.length > 0;
    const setIds = this.buildSetFilterIds(query);

    if (hasText || hasBytes) {
      const embedder = this.deps.getEmbedder();
      const embedding = hasText
        ? await embedder.embedText(query.text!)
        : await embedder.embedImage(Buffer.from(query.imageBytes!));
      return this.embeddingQuery(embedding, setIds, limit, offset);
    }

    if (hasPalette) {
      return this.paletteQuery(query.palette!, setIds, limit, offset);
    }

    const ids =
      setIds ?? this.deps.getOrBuildShuffledIds('default', () => db.images.getVisibleImageIds());
    return this.deps.fetchImagesByIdsInOrder(ids.slice(offset, offset + limit)) as SearchResult[];
  }

  private buildSetFilterIds(query: Query): number[] | null {
    if (!this.hasSetFilter(query)) return null;

    const cacheKey = this.setFilterCacheKey(query);
    return this.deps.getOrBuildShuffledIds(cacheKey, () =>
      this.deps.requireDb().images.getFilteredImageIds(query),
    );
  }

  private hasSetFilter(query: Query): boolean {
    return !!(
      query.includeHidden ||
      query.favorites ||
      query.personId != null ||
      query.folderId != null ||
      (query.tags && query.tags.length > 0) ||
      query.dateRange?.start ||
      query.dateRange?.end
    );
  }

  private setFilterCacheKey(query: Query): string {
    const parts: string[] = [];

    if (query.favorites) parts.push('fav');
    if (query.includeHidden) parts.push('hid');
    if (query.personId != null) parts.push(`p${query.personId}`);
    if (query.folderId != null) parts.push(`f${query.folderId}`);
    if (query.tags && query.tags.length > 0) parts.push(`t=${[...query.tags].sort().join(',')}`);
    if (query.dateRange?.start) parts.push(`ds=${query.dateRange.start}`);
    if (query.dateRange?.end) parts.push(`de=${query.dateRange.end}`);

    return `set:${parts.join('|')}`;
  }

  private scoredOverfetch(limit: number, setIds: number[] | null, cap: number): number {
    const desired = setIds
      ? Math.min(Math.max(limit * 50, 500), Math.max(setIds.length, limit + 100))
      : limit + 100;
    return Math.min(desired, cap);
  }

  private hydrateScoredResults(
    matches: Array<{ imageId: number; distance: number }>,
  ): SearchResult[] {
    if (matches.length === 0) return [];

    const distanceMap = new Map(matches.map((match) => [match.imageId, match.distance]));
    return this.deps
      .fetchImagesByIdsInOrder(matches.map((match) => match.imageId))
      .map((image) => ({
        ...image,
        distance: distanceMap.get(image.id),
      }));
  }

  private embeddingQuery(
    embedding: number[],
    setIds: number[] | null,
    limit: number,
    offset: number,
  ): SearchResult[] {
    const db = this.deps.requireDb();
    const threshold = 1.3;
    const vecLimit = 4096;
    const k = this.scoredOverfetch(offset + limit, setIds, vecLimit);
    const setIdSet = setIds ? new Set(setIds) : null;

    const ranked = db.vectors.findNearestVisibleImages(embedding, k, threshold);

    const kept: Array<{ rowid: number; distance: number }> = [];
    for (const match of ranked) {
      if (setIdSet && !setIdSet.has(match.rowid)) continue;
      kept.push(match);
    }

    return this.hydrateScoredResults(
      kept.slice(offset, offset + limit).map((match) => ({
        imageId: match.rowid,
        distance: match.distance,
      })),
    );
  }

  private paletteQuery(
    hexColors: string[],
    setIds: number[] | null,
    limit: number,
    offset: number,
  ): SearchResult[] {
    const db = this.deps.requireDb();
    const labs: Array<[number, number, number]> = [];
    for (const hex of hexColors) {
      const lab = hexToOklab(hex);
      if (lab) labs.push(lab);
    }
    if (labs.length === 0) return [];

    const paletteLimitCap = 409;
    const overfetch = this.scoredOverfetch(offset + limit, setIds, paletteLimitCap);
    const ranked = db.palettes.findImagesByColors(labs, overfetch);
    const setIdSet = setIds ? new Set(setIds) : null;
    const kept: Array<{ imageId: number; score: number }> = [];

    for (const match of ranked) {
      if (setIdSet && !setIdSet.has(match.imageId)) continue;
      kept.push(match);
    }

    return this.hydrateScoredResults(
      kept.slice(offset, offset + limit).map((match) => ({
        imageId: match.imageId,
        distance: match.score,
      })),
    );
  }

  async findSimilarImages(imageId: number, limit: number = 20): Promise<SearchResult[]> {
    const db = this.deps.requireDb();
    const embedding = db.vectors.getEmbedding(imageId);
    if (!embedding) return [];

    const vectorLimit = Math.max(limit * 5, limit + 1);
    const matches = db.vectors
      .findNearestImageMatches(embedding, vectorLimit)
      .filter((match) => match.rowid !== imageId);
    const availableIds = db.images.filterVisibleImageIds(matches.map((match) => match.rowid));
    const results = this.hydrateScoredResults(
      matches
        .filter((match) => availableIds.has(match.rowid))
        .slice(0, limit)
        .map((match) => ({
          imageId: match.rowid,
          distance: match.distance,
        })),
    );

    results.sort((left, right) => (left.distance ?? Infinity) - (right.distance ?? Infinity));
    return results;
  }
}
