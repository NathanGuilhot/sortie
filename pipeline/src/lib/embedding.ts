export type EmbeddingValue = Buffer | string | number[];

export interface EmbeddingRowValue {
  rowid: number;
  embedding: EmbeddingValue;
}

export function decodeEmbeddingValue(value: EmbeddingValue): number[] {
  if (Buffer.isBuffer(value)) {
    const floatArray = new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4);
    return Array.from(floatArray);
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as number[];
  }

  return value;
}

export function decodeEmbeddingRows(rows: EmbeddingRowValue[]): Array<{ rowid: number; embedding: number[] }> {
  return rows.map((row) => ({
    rowid: row.rowid,
    embedding: decodeEmbeddingValue(row.embedding),
  }));
}
