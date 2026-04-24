import { useMemo } from 'react';
import { Query } from 'shared';

interface UseBuiltSearchQueryArgs {
  searchQuery: string;
  personFilter: number | null;
  folderFilter: number | null;
  tagFilters: string[];
  paletteFilters: string[];
  showFavoritesOnly: boolean;
  showHidden: boolean;
  dateRange: { start: Date | null; end: Date | null };
  imageBytes: Uint8Array | null;
}

export function useBuiltSearchQuery({
  searchQuery,
  personFilter,
  folderFilter,
  tagFilters,
  paletteFilters,
  showFavoritesOnly,
  showHidden,
  dateRange,
  imageBytes,
}: UseBuiltSearchQueryArgs): Query {
  const dateStart = dateRange.start ? dateRange.start.toISOString() : null;
  const dateEnd = dateRange.end ? dateRange.end.toISOString() : null;

  return useMemo(() => {
    const query: Query = {};
    const text = searchQuery.trim();

    if (imageBytes) query.imageBytes = imageBytes;
    else if (text) query.text = text;

    if (personFilter !== null) query.personId = personFilter;
    if (folderFilter !== null) query.folderId = folderFilter;
    if (tagFilters.length > 0) query.tags = tagFilters;
    if (paletteFilters.length > 0) query.palette = paletteFilters;
    if (showFavoritesOnly) query.favorites = true;
    if (showHidden) query.includeHidden = true;
    if (dateStart || dateEnd) query.dateRange = { start: dateStart, end: dateEnd };

    return query;
  }, [
    searchQuery,
    imageBytes,
    personFilter,
    folderFilter,
    tagFilters,
    paletteFilters,
    showFavoritesOnly,
    showHidden,
    dateStart,
    dateEnd,
  ]);
}
