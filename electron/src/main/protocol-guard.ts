import path from 'path';

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function isServablePath(
  requestedPath: string,
  libraryFolders: readonly string[],
  allowedRoots: readonly string[],
): boolean {
  const resolved = path.resolve(requestedPath);
  return (
    allowedRoots.some((root) => isPathInside(root, resolved)) ||
    libraryFolders.some((folder) => isPathInside(folder, resolved))
  );
}

export interface ProtocolPathGuardDeps {
  allowedRoots: readonly string[];
  getLibraryFolderPaths(): Promise<readonly string[]>;
  isKnownImagePath(requestedPath: string): boolean;
}

export function createProtocolPathGuard(
  deps: ProtocolPathGuardDeps,
): (requestedPath: string) => Promise<boolean> {
  return async (requestedPath) => {
    if (isServablePath(requestedPath, [], deps.allowedRoots)) return true;
    try {
      const folders = await deps.getLibraryFolderPaths();
      if (isServablePath(requestedPath, folders, [])) return true;
      return deps.isKnownImagePath(requestedPath);
    } catch {
      // Library not ready (startup) or lookup failed: serve nothing outside app roots.
      return false;
    }
  };
}
