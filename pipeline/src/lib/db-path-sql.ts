export const sqlPath = (expression: string): string => `replace(${expression}, char(92), '/')`;

export function normalizePathForSqlLike(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function pathPrefixLikePattern(folderPath: string): string {
  return `${normalizePathForSqlLike(folderPath)}/%`;
}

// Excludes images covered by another registered folder; bind the current folder to `?`.

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
