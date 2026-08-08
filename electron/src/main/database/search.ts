import { type ClipEmbedder, type DatabaseManager, hexToOklab } from 'pipeline';
import type { Query, SearchResult } from 'shared';
import { sqlPath } from 'pipeline';

type SqlBinding = string | number | bigint | Uint8Array | null;

interface DatabaseSearchDeps {
  requireDb(): DatabaseManager;
  getEmbedder(): ClipEmbedder;
  getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[];
  fetchImagesByIdsInOrder(ids: number[]): ReturnType<DatabaseManager['getImagesByIds']>;
}

export class DatabaseSearchService {
  constructor(private readonly deps: DatabaseSearchDeps) {}

  private queryIds(idQuery: string, params: SqlBinding[] = []): number[] {
    const statement = this.deps.requireDb().getDatabase().prepare(idQuery);
    const rows = statement.all(...params) as Array<{ id: number }>;
    return rows.map((row) => row.id);
  }

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

    const ids = setIds ?? this.deps.getOrBuildShuffledIds('default', () => db.getVisibleImageIds());
    return this.deps.fetchImagesByIdsInOrder(ids.slice(offset, offset + limit)) as SearchResult[];
  }

  private buildSetFilterIds(query: Query): number[] | null {
    const where: string[] = [];
    const params: SqlBinding[] = [];
    let active = false;

    where.push(query.includeHidden ? 'i.missing = 0' : 'i.hidden = 0 AND i.missing = 0');

    if (query.favorites) {
      where.push('i.favorite = 1');
      active = true;
    }

    if (query.personId != null) {
      where.push('EXISTS (SELECT 1 FROM faces f WHERE f.image_id = i.id AND f.person_id = ?)');
      params.push(query.personId);
      active = true;
    }

    if (query.folderId != null) {
      where.push(
        `EXISTS (SELECT 1 FROM folders fo WHERE fo.id = ? AND ${sqlPath('i.file_path')} LIKE ${sqlPath('fo.path')} || '/%')`,
      );
      params.push(query.folderId);
      active = true;
    }

    if (query.tags && query.tags.length > 0) {
      const placeholders = query.tags.map(() => '?').join(',');
      where.push(
        `(SELECT COUNT(DISTINCT t.id)
            FROM image_tags it JOIN tags t ON it.tag_id = t.id
            WHERE it.image_id = i.id AND t.name IN (${placeholders})) = ?`,
      );
      params.push(...query.tags, query.tags.length);
      active = true;
    }

    if (query.dateRange?.start) {
      where.push('i.captured_at >= ?');
      params.push(query.dateRange.start);
      active = true;
    }

    if (query.dateRange?.end) {
      where.push('i.captured_at <= ?');
      params.push(query.dateRange.end);
      active = true;
    }

    if (query.includeHidden) {
      active = true;
    }

    if (!active) return null;

    const cacheKey = this.setFilterCacheKey(query);
    return this.deps.getOrBuildShuffledIds(cacheKey, () =>
      this.queryIds(`SELECT i.id FROM images i WHERE ${where.join(' AND ')}`, params),
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

    const statement = db.getDatabase().prepare(`
      SELECT sub.rowid, sub.distance
      FROM (
        SELECT v.rowid, v.distance
        FROM vec_images v
        WHERE v.embedding MATCH ? AND k = ?
      ) sub
      INNER JOIN images i ON i.id = sub.rowid AND i.hidden = 0 AND i.missing = 0
      WHERE sub.distance < ?
      ORDER BY sub.distance
    `);
    const ranked = statement.all(JSON.stringify(embedding), k, threshold) as Array<{
      rowid: number;
      distance: number;
    }>;

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
    const ranked = db.findImagesByColors(labs, overfetch);
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
    const embedding = db.getEmbedding(imageId);
    if (!embedding) return [];

    const vectorLimit = Math.max(limit * 5, limit + 1);
    const matches = db
      .findNearestImageMatches(embedding, vectorLimit)
      .filter((match) => match.rowid !== imageId);
    const availableIds = this.availableImageIdSet(matches.map((match) => match.rowid));
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

  private availableImageIdSet(ids: number[]): Set<number> {
    if (ids.length === 0) return new Set();

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.deps
      .requireDb()
      .getDatabase()
      .prepare(
        `SELECT id
         FROM images
         WHERE id IN (${placeholders})
           AND hidden = 0
           AND missing = 0`,
      )
      .all(...ids) as Array<{ id: number }>;

    return new Set(rows.map((row) => row.id));
  }
}
