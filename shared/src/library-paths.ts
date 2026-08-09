// Store native absolute paths; normalize separators only for comparisons.

export function toPortablePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function folderCoversPath(folderPath: string, filePath: string): boolean {
  const folder = toPortablePath(folderPath);
  const file = toPortablePath(filePath);
  return file === folder || file.startsWith(`${folder}/`);
}

export function mostSpecificFolderForPath<T extends { path: string }>(
  folders: readonly T[],
  filePath: string,
): T | null {
  let best: T | null = null;
  for (const folder of folders) {
    if (!folderCoversPath(folder.path, filePath)) continue;
    if (!best || folder.path.length > best.path.length) best = folder;
  }
  return best;
}
