export const sqlPath = (expression: string): string => `replace(${expression}, char(92), '/')`;

export function normalizePathForSqlLike(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function pathPrefixLikePattern(folderPath: string): string {
  return `${normalizePathForSqlLike(folderPath)}/%`;
}
