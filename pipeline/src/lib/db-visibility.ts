export function visibleImageSql(alias = 'images'): string {
  return `${alias}.hidden = 0 AND ${alias}.missing = 0`;
}
