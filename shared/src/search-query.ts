import type { Query } from './types';

function hasNonEmptyText(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
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
