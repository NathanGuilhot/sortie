import { PinterestResult, PinterestSearchPage } from 'shared';
import {
  ParsedTarget,
  PinterestAPIError,
  getBoardFeed,
  getBoardInfo,
  isEndBookmark,
  parsePinterestInput,
  searchPins,
} from './api';
import { parsePins } from './parser';

const DEFAULT_TARGET_RESULTS = 50;
const MAX_BATCHES = 6;
const BATCH_DELAY_MS = 200;

const CANARY_QUERY = 'cat';
const CANARY_TTL_MS = 5 * 60 * 1000;
let canaryReachableUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pinterest returns HTTP 200 with empty results + bookmarks: ['-end-'] both for
// genuinely empty searches AND for VPN/region-blocked traffic. The only way to
// tell them apart is to probe with a canary query that should always have results.
async function pinterestReachable(): Promise<boolean> {
  if (Date.now() < canaryReachableUntil) return true;
  const { pins } = await searchPins({ query: CANARY_QUERY, pageSize: 1 });
  if (pins.length > 0) {
    canaryReachableUntil = Date.now() + CANARY_TTL_MS;
    return true;
  }
  return false;
}

function dedupeByPinId(
  existing: PinterestResult[],
  incoming: PinterestResult[],
): PinterestResult[] {
  if (existing.length === 0) return incoming;
  const seen = new Set(existing.map((r) => r.pinId));
  const merged = existing.slice();
  for (const item of incoming) {
    if (seen.has(item.pinId)) continue;
    seen.add(item.pinId);
    merged.push(item);
  }
  return merged;
}

export async function scrapeFirstPage(
  target: ParsedTarget,
  desired: number = DEFAULT_TARGET_RESULTS,
): Promise<PinterestSearchPage> {
  if (target.kind === 'search') {
    return scrapeSearch(target.query, desired);
  }
  return scrapeBoard(target.username, target.slug, desired);
}

async function scrapeSearch(query: string, desired: number): Promise<PinterestSearchPage> {
  let bookmarks: string[] = [];
  let results: PinterestResult[] = [];
  let batches = 0;

  while (results.length < desired && batches < MAX_BATCHES) {
    const { pins, bookmarks: nextBookmarks } = await searchPins({
      query,
      pageSize: 50,
      bookmarks,
    });
    const parsed = parsePins(pins);
    results = dedupeByPinId(results, parsed);
    bookmarks = nextBookmarks;
    batches++;
    if (isEndBookmark(bookmarks) || pins.length === 0) {
      if (results.length === 0 && query.toLowerCase() !== CANARY_QUERY) {
        const reachable = await pinterestReachable();
        if (!reachable) {
          throw new PinterestAPIError(
            'Pinterest returned no results for any query on this connection.',
            undefined,
            'blocked',
          );
        }
      }
      return { results: results.slice(0, desired), bookmarks, isEnd: true };
    }
    if (results.length < desired) await sleep(BATCH_DELAY_MS);
  }

  return {
    results: results.slice(0, desired),
    bookmarks,
    isEnd: isEndBookmark(bookmarks),
  };
}

async function scrapeBoard(
  username: string,
  slug: string,
  desired: number,
): Promise<PinterestSearchPage> {
  const info = await getBoardInfo(username, slug);
  const goal = Math.min(desired, info.pinCount > 0 ? info.pinCount : desired);

  let bookmarks: string[] = [];
  let results: PinterestResult[] = [];
  let batches = 0;

  while (results.length < goal && batches < MAX_BATCHES) {
    const { pins, bookmarks: nextBookmarks } = await getBoardFeed({
      boardId: info.boardId,
      username,
      slug,
      pageSize: 50,
      bookmarks,
    });
    const parsed = parsePins(pins);
    results = dedupeByPinId(results, parsed);
    bookmarks = nextBookmarks;
    batches++;
    if (isEndBookmark(bookmarks) || pins.length === 0) {
      return {
        results: results.slice(0, goal),
        bookmarks,
        isEnd: true,
        boardPinCount: info.pinCount,
      };
    }
    if (results.length < goal) await sleep(BATCH_DELAY_MS);
  }

  return {
    results: results.slice(0, goal),
    bookmarks,
    isEnd: isEndBookmark(bookmarks),
    boardPinCount: info.pinCount,
  };
}

export async function loadMore(
  target: ParsedTarget,
  bookmarks: string[],
  desired: number = DEFAULT_TARGET_RESULTS,
): Promise<PinterestSearchPage> {
  if (isEndBookmark(bookmarks)) {
    return { results: [], bookmarks, isEnd: true };
  }
  if (target.kind === 'search') {
    const { pins, bookmarks: next } = await searchPins({
      query: target.query,
      pageSize: Math.min(50, desired),
      bookmarks,
    });
    return {
      results: parsePins(pins).slice(0, desired),
      bookmarks: next,
      isEnd: isEndBookmark(next),
    };
  }
  // For board: requires the boardId: caller must re-resolve via getBoardInfo if reusing across sessions.
  const info = await getBoardInfo(target.username, target.slug);
  const { pins, bookmarks: next } = await getBoardFeed({
    boardId: info.boardId,
    username: target.username,
    slug: target.slug,
    pageSize: Math.min(50, desired),
    bookmarks,
  });
  return {
    results: parsePins(pins).slice(0, desired),
    bookmarks: next,
    isEnd: isEndBookmark(next),
  };
}

export { PinterestAPIError, parsePinterestInput };
export type { ParsedTarget };
