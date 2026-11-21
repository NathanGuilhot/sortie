export interface OcrBlock {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  polygon?: [[number, number], [number, number], [number, number], [number, number]];
  confidence: number;
}

/** A span of an OCR block's text, as UTF-16 offsets into `OcrBlock.text`. */
export interface OcrTextRange {
  /** Index of the block in the image's full OCR block list. */
  block: number;
  start: number;
  end: number;
}

/** The OCR text of a search result that matched the query. */
export interface OcrSearchMatch {
  /** Only the blocks that contain a match, each with its index in the full list. */
  blocks: Array<OcrBlock & { index: number }>;
  ranges: OcrTextRange[];
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
