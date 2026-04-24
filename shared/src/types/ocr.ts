export interface OcrBlock {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  polygon?: [[number, number], [number, number], [number, number], [number, number]];
  confidence: number;
}

export type OcrStatus = 'done' | 'empty' | `error:${string}` | null;

export interface OcrResult {
  status: OcrStatus;
  at: number | null;
  blocks: OcrBlock[];
}

export interface OcrUpdatePayload {
  imageId: number;
  status: Exclude<OcrStatus, null>;
  blocks: OcrBlock[];
}
