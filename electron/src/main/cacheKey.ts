import crypto from 'crypto';

export function buildCacheKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}
