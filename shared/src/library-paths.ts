// One owner for library path semantics, shared by the renderer, electron main,
// and pipeline. Policy: *storage* keeps native absolute paths (electron
// resolves with path.resolve before writing); *comparison* always goes through
// toPortablePath (JS) or sqlPath (SQL, pipeline/src/lib/db-path-sql.ts) so
// Windows backslash spellings compare equal to forward-slash ones.

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
