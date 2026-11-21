import { type ClipEmbedder, type DatabaseManager, hexToOklab } from 'pipeline';
import {
  hasSearchText,
  matchOcrText,
  ocrQueryWords,
  parseSearchText,
  type ImagePage,
  type OcrSearchMatch,
  type ParsedSearchText,
  type Query,
  type SearchResult,
} from 'shared';
import { ocrRowToBlock } from '../database-ocr';

// Most images checked for an exact text match per search.
const OCR_CANDIDATE_LIMIT = 2000;

interface ScoredMatch {
  imageId: number;
  distance: number | undefined;
  ocrMatch?: OcrSearchMatch;
}

interface DatabaseSearchDeps {
  requireDb(): DatabaseManager;
  getEmbedder(): ClipEmbedder;
  getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[];
  fetchImagesByIdsInOrder(ids: number[]): ReturnType<DatabaseManager['images']['getImagesByIds']>;
}

export class DatabaseSearchService {
  constructor(private readonly deps: DatabaseSearchDeps) {}

  async queryImages(query: Query): Promise<ImagePage<SearchResult>> {
    const db = this.deps.requireDb();
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    const text = parseSearchText(query.text ?? '');
    const hasBytes = !!query.imageBytes && query.imageBytes.byteLength > 0;
    const hasPalette = !!query.palette && query.palette.length > 0;
    const setIds = this.buildSetFilterIds(query);

    if (hasBytes) {
      const embedding = await this.deps.getEmbedder().embedImage(Buffer.from(query.imageBytes!));
      const results = this.hydrateScoredResults(
        this.embeddingMatches(embedding, setIds, offset + limit).slice(offset, offset + limit),
      );
      return { images: results, total: results.length };
    }

    if (hasSearchText(text)) {
      const results = await this.textQuery(text, query, setIds, limit, offset);
      return { images: results, total: results.length };
    }

    if (hasPalette) {
      const results = this.paletteQuery(query.palette!, setIds, limit, offset);
      return { images: results, total: results.length };
    }

    const ids =
      setIds ?? this.deps.getOrBuildShuffledIds('default', () => db.images.getVisibleImageIds());
    return {
      images: this.deps.fetchImagesByIdsInOrder(
        ids.slice(offset, offset + limit),
      ) as SearchResult[],
      total: ids.length,
    };
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
      query.folderId != null ||
      (query.tags && query.tags.length > 0) ||
      query.origin?.kind ||
      query.origin?.domain ||
      query.dateRange?.start ||
      query.dateRange?.end
    );
  }

  private setFilterCacheKey(query: Query): string {
    const parts: string[] = [];

    if (query.favorites) parts.push('fav');
    if (query.includeHidden) parts.push('hid');
    if (query.folderId != null) parts.push(`f${query.folderId}`);
    if (query.tags && query.tags.length > 0) parts.push(`t=${[...query.tags].sort().join(',')}`);
    if (query.origin?.kind) parts.push(`ok=${query.origin.kind}`);
    if (query.origin?.domain) parts.push(`od=${query.origin.domain}`);
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

  private hydrateScoredResults(matches: ScoredMatch[]): SearchResult[] {
    if (matches.length === 0) return [];

    const byId = new Map(matches.map((match) => [match.imageId, match]));
    return this.deps.fetchImagesByIdsInOrder(matches.map((match) => match.imageId)).map((image) => {
      const match = byId.get(image.id);
      return { ...image, distance: match?.distance, ocrMatch: match?.ocrMatch };
    });
  }

  /** Visually closest images, best first, up to `wanted` (before slicing a page). */
  private embeddingMatches(
    embedding: number[],
    setIds: number[] | null,
    wanted: number,
  ): ScoredMatch[] {
    const db = this.deps.requireDb();
    const threshold = 1.3;
    const vecLimit = 4096;
    const k = this.scoredOverfetch(wanted, setIds, vecLimit);
    const setIdSet = setIds ? new Set(setIds) : null;

    const kept: ScoredMatch[] = [];
    for (const match of db.vectors.findNearestVisibleImages(embedding, k, threshold)) {
      if (setIdSet && !setIdSet.has(match.rowid)) continue;
      kept.push({ imageId: match.rowid, distance: match.distance });
    }
    return kept;
  }

  /**
   * Images whose OCR text matches, with the matched ranges. Quoted phrases
   * must all appear; otherwise every query word must appear as a whole word.
   */
  private ocrMatches(
    text: ParsedSearchText,
    query: Query,
    setIds: number[] | null,
  ): Map<number, OcrSearchMatch> {
    const db = this.deps.requireDb();
    const terms = text.phrases.length > 0 ? text.phrases : ocrQueryWords(text.rest);
    const matches = new Map<number, OcrSearchMatch>();
    if (terms.length === 0) return matches;

    const setIdSet = setIds ? new Set(setIds) : null;
    const candidates = db.ocr
      .findImagesWithText(terms, {
        includeHidden: !!query.includeHidden,
        limit: OCR_CANDIDATE_LIMIT,
      })
      .filter((id) => !setIdSet || setIdSet.has(id));
    const blocksByImage = db.ocr.getBlocksForImages(candidates);

    for (const imageId of candidates) {
      const rows = blocksByImage.get(imageId) ?? [];
      const blocks = rows.map((row) => ({ text: row.text, index: row.block_index }));
      const ranges = matchOcrText(blocks, text);
      if (!ranges) continue;
      const matched = new Set(ranges.map((range) => range.block));
      matches.set(imageId, {
        blocks: rows
          .filter((row) => matched.has(row.block_index))
          .map((row) => ({ ...ocrRowToBlock(row), index: row.block_index })),
        ranges,
      });
    }
    return matches;
  }

  private async embedTextOrNull(text: string): Promise<number[] | null> {
    if (!text) return null;
    try {
      return await this.deps.getEmbedder().embedText(text);
    } catch (error) {
      console.warn('[search] text embedding failed, showing text matches only:', error);
      return null;
    }
  }

  /**
   * Quoted phrases: only images whose text contains them, ranked by how well
   * the unquoted rest matches visually. No quotes: text matches first, then
   * the usual visual results.
   */
  private async textQuery(
    text: ParsedSearchText,
    query: Query,
    setIds: number[] | null,
    limit: number,
    offset: number,
  ): Promise<SearchResult[]> {
    const db = this.deps.requireDb();
    const ocr = this.ocrMatches(text, query, setIds);
    const embedding = await this.embedTextOrNull(text.rest);
    const distances = embedding ? db.vectors.distancesForImages(embedding, [...ocr.keys()]) : null;

    const textHits: ScoredMatch[] = [...ocr.entries()]
      .map(([imageId, ocrMatch]) => ({ imageId, distance: distances?.get(imageId), ocrMatch }))
      .sort(
        (a, b) =>
          (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
          b.ocrMatch.ranges.length - a.ocrMatch.ranges.length ||
          b.imageId - a.imageId,
      );

    if (text.phrases.length > 0) {
      return this.hydrateScoredResults(textHits.slice(offset, offset + limit));
    }

    const wanted = offset + limit;
    const visual = embedding ? this.embeddingMatches(embedding, setIds, wanted) : [];
    // Text matches lead, but leave at least half the page to visual results.
    // Text searches return a single page (`total` is the result count).
    const visualOnly = visual.filter((match) => !ocr.has(match.imageId));
    const textTake = Math.min(
      textHits.length,
      Math.max(Math.floor(wanted / 2), wanted - visualOnly.length),
    );
    const shown = new Set(textHits.slice(0, textTake).map((match) => match.imageId));
    const merged = [
      ...textHits.slice(0, textTake),
      ...visual
        .filter((match) => !shown.has(match.imageId))
        .map((match) => ({ ...match, ocrMatch: ocr.get(match.imageId) })),
    ];
    return this.hydrateScoredResults(merged.slice(offset, offset + limit));
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
