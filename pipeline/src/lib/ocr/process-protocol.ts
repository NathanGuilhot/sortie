import path from 'path';
import type { OcrBlock } from 'shared';

export interface OcrProcessRequest {
  id: number;
  filePath: string;
}

export type OcrProcessReply = { id: number; blocks: OcrBlock[] } | { id: number; error: string };

/** Built path of the OCR utility process entry, next to this file. */
export const OCR_PROCESS_ENTRY = path.join(__dirname, 'process-entry.js');
