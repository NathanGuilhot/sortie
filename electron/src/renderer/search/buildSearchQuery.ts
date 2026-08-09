import type { Query } from 'shared';

export interface SearchQueryInputs {
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

export function buildSearchQuery(inputs: SearchQueryInputs): Query {
  const query: Query = {};
  const text = inputs.searchQuery.trim();
  if (inputs.imageBytes) query.imageBytes = inputs.imageBytes;
  else if (text) query.text = text;
  if (inputs.personFilter !== null) query.personId = inputs.personFilter;
  if (inputs.folderFilter !== null) query.folderId = inputs.folderFilter;
  if (inputs.tagFilters.length) query.tags = inputs.tagFilters;
  if (inputs.paletteFilters.length) query.palette = inputs.paletteFilters;
  if (inputs.showFavoritesOnly) query.favorites = true;
  if (inputs.showHidden) query.includeHidden = true;
  const start = inputs.dateRange.start?.toISOString() ?? null;
  const end = inputs.dateRange.end?.toISOString() ?? null;
  if (start || end) query.dateRange = { start, end };
  return query;
}
