import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Image } from 'shared';
import { usePinterestStore } from '../stores/pinterestStore';
import { useUIStore } from '../stores/uiStore';
import { PinterestResultCard } from '../components/PinterestResultCard';
import { BulkImportButton } from '../components/BulkImportButton';
import { MetadataModal } from '../components/MetadataModal';
import { computeMasonryLayout, type LayoutResult } from '../components/masonry-layout';
import { EmptyState } from '../components/screen';
import { ImportSearchBar } from './ImportSearchBar';
import { BookIcon } from '../components/icons';
import { toast } from '../stores/toastStore';

const GAP = 8;
const MIN_COL_WIDTH = 200;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;

const bookIconNode = <BookIcon />;

export function ImportScreen() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get('q') ?? '';

  const {
    query: storedQuery,
    target,
    boardPinCount,
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
  const [previewImage, setPreviewImage] = useState<Image | null>(null);
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

  const handlePreview = useCallback((imageId: number) => {
    window.sortieAPI
      .getImage(imageId)
      .then((img) => {
        if (img) setPreviewImage(img);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to open preview: ${message}`);
      });
  }, []);

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
      <ImportSearchBar
        containerRef={containerRef}
        inputRef={inputRef}
        input={input}
        loading={loading}
        isFocused={isFocused}
        hasActiveFilters={hasActiveFilters}
        showFilters={showFilters}
        showDropdown={showDropdown}
        hideAiGenerated={hideAiGenerated}
        onSubmit={handleSubmit}
        onInputChange={setInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClear={handleClear}
        onToggleFilters={() => setShowFilters((value) => !value)}
        onSetHideAiGenerated={setHideAiGenerated}
      />

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
              icon={bookIconNode}
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
              icon={bookIconNode}
              title="No results"
              description={`Nothing matched ${targetLabel}. Try a different keyword or URL.`}
            />
          )}

          {showAllHidden && (
            <EmptyState
              icon={bookIconNode}
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
              {target?.kind === 'board' ? (
                <div className="max-w-3xl mx-auto mb-4 px-4 py-3 rounded-2xl bg-white border border-gray-200/70 shadow-sm flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink truncate">
                      {target.username}
                      <span className="text-gray-300"> / </span>
                      <span className="text-gray-700">{target.slug}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 tabular-nums">
                      {boardPinCount != null
                        ? `${boardPinCount} pin${boardPinCount !== 1 ? 's' : ''}`
                        : `${visibleResults.length} loaded`}
                      {hiddenAiCount > 0 && (
                        <span className="text-gray-400">
                          {' '}
                          · {hiddenAiCount} AI-generated hidden
                        </span>
                      )}
                    </div>
                  </div>
                  <BulkImportButton />
                </div>
              ) : targetLabel ? (
                <div className="max-w-2xl mx-auto mb-3 text-xs text-gray-400 text-center">
                  {visibleResults.length} result{visibleResults.length !== 1 ? 's' : ''} for{' '}
                  {targetLabel}
                  {hiddenAiCount > 0 && (
                    <span className="text-gray-300"> · {hiddenAiCount} AI-generated hidden</span>
                  )}
                </div>
              ) : null}
              <div className="relative" style={{ height: layout.totalHeight }}>
                {visibleResults.map((pin, i) => {
                  const position = layout.positions[i];
                  if (!position) return null;
                  return (
                    <PinterestResultCard
                      key={pin.pinId}
                      pin={pin}
                      position={position}
                      onPreview={handlePreview}
                    />
                  );
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

      {previewImage && (
        <MetadataModal
          image={previewImage}
          images={[previewImage]}
          onClose={() => setPreviewImage(null)}
          onNavigate={setPreviewImage}
        />
      )}
    </main>
  );
}
