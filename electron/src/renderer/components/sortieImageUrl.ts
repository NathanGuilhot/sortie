export function buildSortieFileUrl(filePath: string, cacheKey?: string | number | null): string {
  const params = new URLSearchParams({ path: filePath });
  if (cacheKey != null) params.set('v', String(cacheKey));
  return `sortie-file://image?${params.toString()}`;
}

export function buildSortieThumbUrl(
  filePath: string,
  width: number,
  cacheKey?: string | number | null,
): string {
  const params = new URLSearchParams({ path: filePath, w: String(width) });
  if (cacheKey != null) params.set('v', String(cacheKey));
  return `sortie-thumb://image?${params.toString()}`;
}

export function buildSortieEditPreviewUrl(
  filePath: string,
  clockwiseTurns: number,
  flipped: boolean,
  size: number,
  cacheKey?: string | number | null,
): string {
  const params = new URLSearchParams({
    path: filePath,
    turns: String(clockwiseTurns),
    flipped: String(flipped),
    size: String(size),
  });
  if (cacheKey != null) params.set('v', String(cacheKey));
  return `sortie-edit-preview://image?${params.toString()}`;
}
