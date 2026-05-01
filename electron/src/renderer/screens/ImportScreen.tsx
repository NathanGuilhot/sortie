import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Image } from 'shared';
import { usePinterestImportStore } from '../stores/pinterestImportStore';
import { usePinterestStore } from '../stores/pinterestStore';
import { useUIStore } from '../stores/uiStore';
import { toast } from '../stores/toastStore';
import { ImportSearchBar } from './ImportSearchBar';
import { ImportResultsGrid } from './ImportResultsGrid';
import { useMasonryLayout } from '../components/useMasonryLayout';
import { useImportSearchParams } from './useImportSearchParams';
import '../stores/pinterest-events';

export function ImportScreen() {
  const {
    query: storedQuery,
    target,
    boardPinCount,
    results,
    loading,
    loadingMore,
    error,
    isEnd,
    search,
    loadMore,
    reset,
  } = usePinterestImportStore();
  const hideAiGenerated = usePinterestStore((state) => state.hideAiGenerated);
  const setHideAiGenerated = usePinterestStore((state) => state.setHideAiGenerated);
  const visibleResults = useMemo(
    () => (hideAiGenerated ? results.filter((result) => !result.isAiGenerated) : results),
    [hideAiGenerated, results],
  );
  const hiddenAiCount = results.length - visibleResults.length;
  const [showFilters, setShowFilters] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [previewImage, setPreviewImage] = useState<Image | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const { input, setInput, handleClear, handleSubmit } = useImportSearchParams({
    inputRef,
    resultsLength: results.length,
    search,
    reset,
    storedQuery,
  });
  const layoutItems = useMemo(
    () =>
      visibleResults.map((result) => ({
        id: result.pinId,
        width: result.width,
        height: result.height,
      })),
    [visibleResults],
  );
  const {
    containerRef: gridRef,
    columns,
    layout,
  } = useMasonryLayout({
    items: layoutItems,
    scrollContainerRef: scrollRef,
    padding: 0,
    minColWidth: 200,
    maxColumns: 6,
    resumeOnAppend: true,
  });
  const hasActiveFilters = hideAiGenerated;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const focusSearchRequestedAt = useUIStore((state) => state.focusSearchRequestedAt);
  useEffect(() => {
    if (focusSearchRequestedAt > 0) {
      inputRef.current?.focus();
    }
  }, [focusSearchRequestedAt]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const onScroll = () => {
      if (loadingMore || loading || isEnd) return;
      const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 600;
      if (nearBottom) {
        void loadMore();
      }
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [isEnd, loadMore, loading, loadingMore]);

  useEffect(() => {
    if (!hideAiGenerated) return;
    if (loading || loadingMore || isEnd) return;
    if (results.length === 0) return;
    if (visibleResults.length >= 8) return;
    void loadMore();
  }, [
    hideAiGenerated,
    isEnd,
    loadMore,
    loading,
    loadingMore,
    results.length,
    visibleResults.length,
  ]);

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
      .then((image) => {
        if (image) {
          setPreviewImage(image);
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to open preview: ${message}`);
      });
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsFocused(false);
      setShowFilters(false);
      inputRef.current?.blur();
    }
  };

  const showError = !loading && error !== null;
  const showEmpty = !loading && !error && results.length === 0 && storedQuery !== '';
  const showWelcome = !loading && !error && results.length === 0 && storedQuery === '';
  const showAllHidden =
    !loading &&
    !loadingMore &&
    !error &&
    results.length > 0 &&
    visibleResults.length === 0 &&
    hideAiGenerated &&
    isEnd;
  const handleRetry = useCallback(() => {
    if (storedQuery) void search(storedQuery);
  }, [search, storedQuery]);
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
        showDropdown={showFilters}
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
        <ImportResultsGrid
          boardPinCount={boardPinCount}
          columns={columns}
          error={error}
          gridRef={gridRef}
          hiddenAiCount={hiddenAiCount}
          isEnd={isEnd}
          layout={layout}
          loading={loading}
          loadingMore={loadingMore}
          previewImage={previewImage}
          results={results}
          setPreviewImage={setPreviewImage}
          showAllHidden={showAllHidden}
          showEmpty={showEmpty}
          showError={showError}
          showWelcome={showWelcome}
          target={target}
          targetLabel={targetLabel}
          visibleResults={visibleResults}
          onPreview={handlePreview}
          onRetry={handleRetry}
        />
      </div>
    </main>
  );
}
