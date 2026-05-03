export function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - dotProduct(a, b);
}

export function parseOptionalJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
