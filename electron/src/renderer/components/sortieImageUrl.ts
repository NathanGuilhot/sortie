export function buildSortieFileUrl(filePath: string): string {
  const params = new URLSearchParams({ path: filePath });
  return `sortie-file://image?${params.toString()}`;
}

export function buildSortieThumbUrl(filePath: string, width: number): string {
  const params = new URLSearchParams({ path: filePath, w: String(width) });
  return `sortie-thumb://image?${params.toString()}`;
}
