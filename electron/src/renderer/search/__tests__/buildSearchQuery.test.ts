import { describe, expect, it } from 'vitest';
import { buildSearchQuery } from '../buildSearchQuery';

const base = {
  searchQuery: '',
  personFilter: null,
  folderFilter: null,
  tagFilters: [],
  paletteFilters: [],
  showFavoritesOnly: false,
  showHidden: false,
  dateRange: { start: null, end: null },
  imageBytes: null,
};

describe('buildSearchQuery', () => {
  it('prefers an image query over text and omits empty filters', () => {
    const imageBytes = new Uint8Array([1]);
    expect(buildSearchQuery({ ...base, searchQuery: 'cats', imageBytes })).toEqual({ imageBytes });
  });
  it('serializes date filters', () => {
    expect(
      buildSearchQuery({
        ...base,
        dateRange: { start: new Date('2026-01-01T00:00:00.000Z'), end: null },
      }),
    ).toEqual({ dateRange: { start: '2026-01-01T00:00:00.000Z', end: null } });
  });
});
