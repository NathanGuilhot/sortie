import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePinterestStore } from '../stores/pinterestStore';
import { PinterestResultCard } from '../components/PinterestResultCard';
import { computeMasonryLayout, type LayoutResult } from '../components/masonry-layout';
import { EmptyState } from '../components/screen';

const GAP = 8;
const MIN_COL_WIDTH = 200;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;

const BookIcon = (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
);

export function ImportScreen() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';

  const {
    query: storedQuery,
    target,
    results,
    loading,
    loadingMore,
    error,
    isEnd,
    hideAiGenerated,
    search,
    loadMore,
    reset,
    setHideAiGenerated,
  } = usePinterestStore();

  const visibleResults = useMemo(
    () => (hideAiGenerated ? results.filter((r) => !r.isAiGenerated) : results),
    [results, hideAiGenerated],
  );
  const hiddenAiCount = results.length - visibleResults.length;

  const [input, setInput] = useState(initialQuery || storedQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const lastDeeplinkedQuery = useRef<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // Track grid width via ResizeObserver so column count reflows on window resize.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setGridWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = useMemo(() => {
    if (gridWidth <= 0) return MIN_COLUMNS;
    const fit = Math.floor((gridWidth + GAP) / (MIN_COL_WIDTH + GAP));
    return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, fit));
  }, [gridWidth]);

  // Map PinterestResult into the {id,width,height} shape the layout expects.
  // Hold the previous layout so appends only lay out the tail rather than
  // recomputing every position — that's what keeps existing items from
  // shifting between columns when more results stream in.
  const priorLayoutRef = useRef<LayoutResult | undefined>(undefined);
  const layoutItems = useMemo(
    () => visibleResults.map((r) => ({ id: r.pinId, width: r.width, height: r.height })),
    [visibleResults],
  );
  const layout = useMemo(() => {
    const next = computeMasonryLayout(
      layoutItems,
      gridWidth,
      columns,
      GAP,
      0,
      priorLayoutRef.current,
    );
    priorLayoutRef.current = next;
    return next;
  }, [layoutItems, gridWidth, columns]);

  // Run initial search if a ?q= deeplink is present and we don't already have those results.
  useEffect(() => {
    if (!initialQuery) return;
    if (lastDeeplinkedQuery.current === initialQuery) return;
    if (storedQuery === initialQuery && results.length > 0) {
      lastDeeplinkedQuery.current = initialQuery;
      return;
    }
    lastDeeplinkedQuery.current = initialQuery;
    setInput(initialQuery);
    void search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Infinite scroll near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (loadingMore || loading || isEnd) return;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 600;
      if (nearBottom) void loadMore();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading, loadingMore, isEnd, loadMore]);

  // Auto-prefetch when AI filtering leaves the grid too sparse to trigger the
  // scroll threshold. Without this, AI-heavy queries (midjourney etc.) land on
  // an almost-empty screen and the user has no way to pull more pins.
  useEffect(() => {
    if (!hideAiGenerated) return;
    if (loading || loadingMore || isEnd) return;
    if (results.length === 0) return;
    if (visibleResults.length >= 8) return;
    void loadMore();
  }, [
    hideAiGenerated,
    visibleResults.length,
    results.length,
    loading,
    loadingMore,
    isEnd,
    loadMore,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    // Reflect the query in the URL so refreshes/back-forward keep state.
    setParams({ q: trimmed }, { replace: true });
    void search(trimmed);
  };

  const handleClear = () => {
    setInput('');
    reset();
    setParams({}, { replace: true });
    inputRef.current?.focus();
  };

  const showEmpty = !loading && !error && results.length === 0 && storedQuery !== '';
  const showWelcome = !loading && !error && results.length === 0 && storedQuery === '';
  // All fetched pins are AI-labelled and the user is hiding them — show a
  // specific message instead of the generic "no results" so they know to
  // toggle the filter off, not change their query.
  const showAllHidden =
    !loading &&
    !loadingMore &&
    !error &&
    results.length > 0 &&
    visibleResults.length === 0 &&
    hideAiGenerated &&
    isEnd;

  const targetLabel =
    target?.kind === 'board'
      ? `${target.username}/${target.slug}`
      : target?.kind === 'search'
        ? `“${target.query}”`
        : '';

  return (
    <main className="flex-1 overflow-hidden flex flex-col">
      {/* Search bar — same visual language as the gallery's */}
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <div className="flex-1 flex items-center h-11 px-4 rounded-2xl border bg-white shadow-lg shadow-black/5 border-gray-200/60">
              <svg
                className="w-4 h-4 text-gray-400 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 ml-3"
                placeholder="Search Pinterest or paste a board URL..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              {input && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
                  title="Clear"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-5 text-sm font-medium rounded-2xl bg-ink text-white hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching
                </span>
              ) : (
                'Search'
              )}
            </button>
          </form>
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-gray-400">
            <span>
              Click any image to add it to your library — the rest stay just for this session.
            </span>
          </div>
          <div className="mt-2 flex items-center justify-center">
            <label className="inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-gray-300 text-ink focus:ring-ink/40 cursor-pointer"
                checked={hideAiGenerated}
                onChange={(e) => setHideAiGenerated(e.target.checked)}
              />
              <span>Hide AI-generated</span>
            </label>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-20">
        {error && (
          <div className="max-w-2xl mx-auto mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Stable width-tracker: gridRef stays on this element for the whole
            screen lifetime so the ResizeObserver isn't torn off when results
            arrive. */}
        <div ref={gridRef} className="w-full">
          {loading && results.length === 0 && (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-gray-200 animate-pulse"
                  style={{
                    height: [220, 300, 260, 200, 320, 240, 280, 210, 290, 250, 230, 270][i],
                  }}
                />
              ))}
            </div>
          )}

          {showWelcome && (
            <EmptyState
              icon={BookIcon}
              title="Add more from the web"
              description={
                <>
                  Search Pinterest by keyword, or paste a board URL like{' '}
                  <code className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                    pinterest.com/&lt;user&gt;/&lt;board&gt;/
                  </code>
                </>
              }
            />
          )}

          {showEmpty && (
            <EmptyState
              icon={BookIcon}
              title="No results"
              description={`Nothing matched ${targetLabel}. Try a different keyword or URL.`}
            />
          )}

          {showAllHidden && (
            <EmptyState
              icon={BookIcon}
              title="All results hidden"
              description={
                <>
                  All {results.length} pin{results.length !== 1 ? 's' : ''} for {targetLabel} are
                  AI-generated. Uncheck <em>Hide AI-generated</em> above to show them.
                </>
              }
            />
          )}

          {results.length > 0 && !showAllHidden && (
            <>
              {targetLabel && (
                <div className="max-w-2xl mx-auto mb-3 text-xs text-gray-400 text-center">
                  {visibleResults.length} result{visibleResults.length !== 1 ? 's' : ''} for{' '}
                  {targetLabel}
                  {hiddenAiCount > 0 && (
                    <span className="text-gray-300"> · {hiddenAiCount} AI-generated hidden</span>
                  )}
                </div>
              )}
              <div className="relative" style={{ height: layout.totalHeight }}>
                {visibleResults.map((pin, i) => {
                  const position = layout.positions[i];
                  if (!position) return null;
                  return <PinterestResultCard key={pin.pinId} pin={pin} position={position} />;
                })}
              </div>
              {loadingMore && (
                <div className="mt-4 text-center text-xs text-gray-400">Loading more…</div>
              )}
              {isEnd && visibleResults.length > 0 && (
                <div className="mt-4 text-center text-xs text-gray-300">— end of results —</div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
