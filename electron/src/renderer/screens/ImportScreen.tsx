import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePinterestStore } from '../stores/pinterestStore';
import { useUIStore } from '../stores/uiStore';
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
  const [showFilters, setShowFilters] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastDeeplinkedQuery = useRef<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  // Dot on the funnel surfaces "a filter is currently narrowing your results,
  // click here to turn it off" — so it shows while the AI filter is on.
  const hasActiveFilters = hideAiGenerated;

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

  // Re-focus the input whenever Cmd/Ctrl+K is pressed, matching the gallery.
  const focusSearchRequestedAt = useUIStore((s) => s.focusSearchRequestedAt);
  useEffect(() => {
    if (focusSearchRequestedAt > 0) inputRef.current?.focus();
  }, [focusSearchRequestedAt]);

  // Click-outside dismissal for the filters panel — matches the gallery's
  // dropdown behaviour.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleFocus = () => {
    clearTimeout(blurTimeoutRef.current);
    setIsFocused(true);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setIsFocused(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsFocused(false);
      setShowFilters(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = showFilters;

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
    <main className="flex-1 overflow-hidden">
      {/* Search bar — mirrors the gallery's fixed floating bar so navigating
          between screens keeps the same affordance in the same spot. */}
      <div
        ref={containerRef}
        className="fixed top-4 left-1/2 -translate-x-1/2 ml-8 z-20 w-full max-w-xl px-4"
      >
        <form
          onSubmit={handleSubmit}
          className={`flex items-center h-11 px-4 rounded-2xl border transition-all duration-200 ${
            isFocused
              ? 'bg-white shadow-xl border-gray-300'
              : 'bg-white/80 backdrop-blur-lg shadow-lg shadow-black/5 border-gray-200/60'
          }`}
        >
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
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />

          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 shrink-0" />
          )}

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

          {(isFocused || hasActiveFilters) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowFilters((v) => !v)}
              className={`p-1 rounded-full transition-colors shrink-0 ml-1 relative ${
                showFilters
                  ? 'bg-gray-100 text-gray-700'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title="Filters"
              aria-expanded={showFilters}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-coral rounded-full" />
              )}
            </button>
          )}

          {!isFocused && !input && (
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200 ml-2 shrink-0">
              <span className="text-[10px]">&#8984;K</span>
            </kbd>
          )}
        </form>

        {showDropdown && (
          <div className="mt-2 bg-white rounded-2xl border border-gray-200/60 shadow-xl shadow-black/5 overflow-hidden animate-dropdown-in">
            <div className="px-4 py-3 space-y-3">
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 text-ink rounded border-gray-300"
                    checked={hideAiGenerated}
                    onChange={(e) => setHideAiGenerated(e.target.checked)}
                  />
                  <span className="text-xs text-gray-600">Hide AI-generated</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="h-full overflow-y-auto pt-16 pb-10 px-6">
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
