// Reverse-engineered Pinterest API client. Public-content only, anonymous.
// Ports the API mode of github.com/sean1832/pinterest-dl. No browser, no auth.

const ENDPOINTS = {
  SEARCH: 'https://www.pinterest.com/resource/BaseSearchResource/get/',
  BOARD: 'https://www.pinterest.com/resource/BoardResource/get/',
  BOARD_FEED: 'https://www.pinterest.com/resource/BoardFeedResource/get/',
} as const;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Required since 2025-03-07; Pinterest blocks resource calls without it.
const PWS_HANDLER = 'www/pin/[id].js';

// Pinterest tolerates ~5 req/s anonymously; one batch every 200ms is safe.
const REQUEST_TIMEOUT_MS = 12_000;

export type ParsedTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

export class PinterestAPIError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PinterestAPIError';
    this.status = status;
  }
}

let cachedCookieHeader: { value: string; fetchedAt: number } | null = null;
const COOKIE_TTL_MS = 30 * 60 * 1000;

async function getCookieHeader(): Promise<string> {
  const now = Date.now();
  if (cachedCookieHeader && now - cachedCookieHeader.fetchedAt < COOKIE_TTL_MS) {
    return cachedCookieHeader.value;
  }
  const res = await fetch('https://www.pinterest.com/', {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const value = setCookies
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
  if (!value) throw new PinterestAPIError('Pinterest bootstrap returned no cookies');
  cachedCookieHeader = { value, fetchedAt: now };
  return value;
}

// Encode like pinterest-dl: standard urlencode, then `+` → `%20`.
function urlEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
    .replace(/\+/g, '%20');
}

function buildGet(
  endpoint: string,
  options: Record<string, unknown>,
  sourceUrl: string,
): string {
  const query = urlEncode({
    source_url: sourceUrl,
    data: JSON.stringify({ options, context: {} }),
    _: String(Date.now()),
  });
  return `${endpoint}?${query}`;
}

interface PinterestEnvelope<T> {
  resource_response?: {
    data?: T;
    error?: { http_status?: number; message?: string };
  };
  resource?: { options?: { bookmarks?: string[] } };
}

async function callApi<T>(url: string): Promise<PinterestEnvelope<T>> {
  const cookie = await getCookieHeader();
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'x-pinterest-pws-handler': PWS_HANDLER,
      cookie,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'accept-language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Cookie may have rotated; clear cache so next call re-bootstraps.
    cachedCookieHeader = null;
    throw new PinterestAPIError(`Pinterest API ${res.status} ${res.statusText}`, res.status);
  }
  let json: PinterestEnvelope<T>;
  try {
    json = (await res.json()) as PinterestEnvelope<T>;
  } catch (err) {
    throw new PinterestAPIError(`Failed to parse Pinterest response: ${(err as Error).message}`);
  }
  const apiError = json.resource_response?.error;
  if (apiError?.message) {
    throw new PinterestAPIError(
      apiError.message,
      apiError.http_status,
    );
  }
  return json;
}

const BOARD_URL_RE =
  /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.[a-z.]+\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/i;

const PIN_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.[a-z.]+\/pin\/(\d+)\/?/i;
const SEARCH_URL_RE =
  /^https?:\/\/(?:[a-z0-9-]+\.)?pinterest\.[a-z.]+\/search\/pins\/\?q=([^&]+)/i;

export function parsePinterestInput(input: string): ParsedTarget {
  const trimmed = input.trim();
  if (!trimmed) throw new PinterestAPIError('Empty input');

  // Pin URL — treat as a single-pin board lookup is unsupported in v1.
  if (PIN_URL_RE.test(trimmed)) {
    throw new PinterestAPIError(
      "Direct pin URLs aren't supported yet — paste a board URL or search by keyword instead.",
    );
  }

  const searchMatch = trimmed.match(SEARCH_URL_RE);
  if (searchMatch) {
    return { kind: 'search', query: decodeURIComponent(searchMatch[1].replace(/\+/g, ' ')) };
  }

  const boardMatch = trimmed.match(BOARD_URL_RE);
  if (boardMatch) {
    const username = boardMatch[1];
    const slug = boardMatch[2];
    // Reserved Pinterest segments that look like usernames but aren't.
    const RESERVED = new Set(['pin', 'search', 'login', 'signup', 'today', 'ideas', 'business']);
    if (!RESERVED.has(username.toLowerCase())) {
      return { kind: 'board', username, slug };
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    throw new PinterestAPIError(
      "That URL doesn't look like a Pinterest board. Try a URL like https://www.pinterest.com/<user>/<board>/",
    );
  }

  return { kind: 'search', query: trimmed };
}

export interface SearchOptions {
  query: string;
  pageSize?: number;
  bookmarks?: string[];
}

export async function searchPins(opts: SearchOptions): Promise<{
  pins: unknown[];
  bookmarks: string[];
}> {
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 50));
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(opts.query)}rs=typed`;
  const url = buildGet(
    ENDPOINTS.SEARCH,
    {
      appliedProductFilters: '---',
      auto_correction_disabled: false,
      bookmarks: opts.bookmarks ?? [],
      page_size: pageSize,
      query: opts.query,
      redux_normalize_feed: true,
      rs: 'typed',
      scope: 'pins',
      source_url: sourceUrl,
    },
    sourceUrl,
  );
  const env = await callApi<{ results?: unknown[] }>(url);
  const data = env.resource_response?.data;
  const pins = (data && 'results' in (data as object) ? (data as { results?: unknown[] }).results : undefined) ?? [];
  const bookmarks = env.resource?.options?.bookmarks ?? [];
  return { pins, bookmarks };
}

export interface BoardInfo {
  boardId: string;
  pinCount: number;
}

export async function getBoardInfo(username: string, slug: string): Promise<BoardInfo> {
  const sourceUrl = `/${username}/${slug}/`;
  const url = buildGet(
    ENDPOINTS.BOARD,
    { username, slug, field_set_key: 'detailed' },
    sourceUrl,
  );
  const env = await callApi<{ id?: string; pin_count?: number }>(url);
  const data = env.resource_response?.data;
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
    throw new PinterestAPIError(`Board not found: ${username}/${slug}`, 404);
  }
  const d = data as { id: string; pin_count?: number };
  return { boardId: d.id, pinCount: d.pin_count ?? 0 };
}

export interface BoardFeedOptions {
  boardId: string;
  username: string;
  slug: string;
  pageSize?: number;
  bookmarks?: string[];
}

export async function getBoardFeed(opts: BoardFeedOptions): Promise<{
  pins: unknown[];
  bookmarks: string[];
}> {
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 50));
  const boardUrl = `/${opts.username}/${opts.slug}/`;
  const url = buildGet(
    ENDPOINTS.BOARD_FEED,
    {
      board_id: opts.boardId,
      board_url: boardUrl,
      page_size: pageSize,
      bookmarks: opts.bookmarks ?? [],
      currentFilter: -1,
      field_set_key: 'react_grid_pin',
      filter_section_pins: true,
      sort: 'default',
      layout: 'default',
      redux_normalize_feed: true,
    },
    boardUrl,
  );
  const env = await callApi<unknown[]>(url);
  const pins = (env.resource_response?.data) ?? [];
  const bookmarks = env.resource?.options?.bookmarks ?? [];
  return { pins, bookmarks };
}

export function isEndBookmark(bookmarks: string[]): boolean {
  return bookmarks.some((b) => b === '-end-');
}
