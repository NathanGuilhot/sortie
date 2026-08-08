export const sqlPath = (expression: string): string => `replace(${expression}, char(92), '/')`;

export function normalizePathForSqlLike(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function pathPrefixLikePattern(folderPath: string): string {
  return `${normalizePathForSqlLike(folderPath)}/%`;
}

// Folder-overlap-aware NOT EXISTS clauses. When two registered folders overlap
// (e.g. /foo and /foo/bar), images under the intersection belong to both.
// These filter to images NOT covered by any other folder — used to scope
// folder removal and availability flips so sibling folders' files are left
// alone. Bind the folder being operated on as the `?` parameter.

export const OVERLAP_EXCLUDE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM folders f2
  WHERE f2.path <> ?
    AND ${sqlPath('images.file_path')} LIKE ${sqlPath('f2.path')} || '/%'
)`;

export const OVERLAP_EXCLUDE_AVAILABLE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM folders f2
  WHERE f2.path <> ?
    AND f2.available = 1
    AND ${sqlPath('images.file_path')} LIKE ${sqlPath('f2.path')} || '/%'
)`;
