import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { buildSearchQuery } from './buildSearchQuery';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';

export function useGalleryQuery(scrollContainerRef: RefObject<HTMLDivElement | null>) {
  const searchQuery = useUIStore((s) => s.searchQuery);
  const dateRange = useUIStore((s) => s.dateRange);
  const tagFilters = useUIStore((s) => s.tagFilters);
  const showHidden = useUIStore((s) => s.showHidden);
  const showFavoritesOnly = useUIStore((s) => s.showFavoritesOnly);
  const personFilter = useUIStore((s) => s.personFilter);
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
      personFilter,
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
    personFilter,
    folderFilter,
    paletteFilters,
    originFilter,
    originDataRevision,
    activeImageQuery,
  ]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void runQuery(query);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, runQuery, scrollContainerRef]);
  return query;
}
