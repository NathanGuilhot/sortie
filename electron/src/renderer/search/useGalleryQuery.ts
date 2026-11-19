import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { buildSearchQuery } from './buildSearchQuery';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';

const QUERY_DEBOUNCE_MS = 300;

export function useGalleryQuery(scrollContainerRef: RefObject<HTMLDivElement | null>) {
  const searchQuery = useUIStore((s) => s.searchQuery);
  const dateRange = useUIStore((s) => s.dateRange);
  const tagFilters = useUIStore((s) => s.tagFilters);
  const showHidden = useUIStore((s) => s.showHidden);
  const showFavoritesOnly = useUIStore((s) => s.showFavoritesOnly);
  const folderFilter = useUIStore((s) => s.folderFilter);
  const paletteFilters = useUIStore((s) => s.paletteFilters);
  const originFilter = useUIStore((s) => s.originFilter);
  const originDataRevision = useUIStore((s) => s.originDataRevision);
  const activeImageQuery = useImageStore((s) => s.activeImageQuery);
  const runQuery = useImageStore((s) => s.runQuery);
  const query = useMemo(() => {
    void originDataRevision;
    return buildSearchQuery({
      searchQuery,
      dateRange,
      tagFilters,
      showHidden,
      showFavoritesOnly,
      folderFilter,
      paletteFilters,
      originFilter,
      imageBytes: activeImageQuery?.bytes ?? null,
    });
  }, [
    searchQuery,
    dateRange,
    tagFilters,
    showHidden,
    showFavoritesOnly,
    folderFilter,
    paletteFilters,
    originFilter,
    originDataRevision,
    activeImageQuery,
  ]);
  // The debounce is for typing. The query on mount fires at once so the
  // gallery isn't held back on startup. The flag flips when the query
  // actually runs, so StrictMode's discarded first effect doesn't consume it.
  const hasRunRef = useRef(false);
  useEffect(() => {
    const isFirstRun = !hasRunRef.current;
    const timer = setTimeout(
      () => {
        hasRunRef.current = true;
        void runQuery(query);
        if (!isFirstRun) scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      },
      isFirstRun ? 0 : QUERY_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query, runQuery, scrollContainerRef]);
  return query;
}
