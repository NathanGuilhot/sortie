import { describe, expect, it } from 'vitest';
import { buildSortieFileUrl, buildSortieThumbUrl } from '../sortieImageUrl';

describe('Sortie image URLs', () => {
  it('adds a cache revision without changing the requested thumbnail', () => {
    const url = new URL(buildSortieThumbUrl('/photos/a b.jpg', 400, 'mtime-2'));

    expect(url.protocol).toBe('sortie-thumb:');
    expect(url.searchParams.get('path')).toBe('/photos/a b.jpg');
    expect(url.searchParams.get('w')).toBe('400');
    expect(url.searchParams.get('v')).toBe('mtime-2');
  });

  it('keeps the original URL shape when no revision is provided', () => {
    expect(buildSortieFileUrl('/photos/a.jpg')).toBe('sortie-file://image?path=%2Fphotos%2Fa.jpg');
  });
});
