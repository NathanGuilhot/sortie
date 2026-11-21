import { hasSearchText, parseSearchText } from './ocr-text-search';
import type { Query } from './types';

// `""` alone is not a search.
function hasNonEmptyText(value: string | undefined): boolean {
  return value !== undefined && hasSearchText(parseSearchText(value));
}

export function hasScoredSearchDimension(query: Query | null | undefined): boolean {
  if (!query) return false;

  return (
    hasNonEmptyText(query.text) ||
    (query.imageBytes !== undefined && query.imageBytes.byteLength > 0) ||
    (query.palette !== undefined && query.palette.length > 0)
  );
}

export function isPaginatedSearchQuery(query: Query | null | undefined): boolean {
  return !hasScoredSearchDimension(query);
}
