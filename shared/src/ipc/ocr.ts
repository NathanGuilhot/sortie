import type { OcrResult, OcrUpdatePayload } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';

export interface OcrApi {
  ocr: {
    get: (imageId: number) => Promise<OcrResult>;
    ensure: (
      imageId: number,
    ) => Promise<{ available: false } | { available: true; state: OcrResult }>;
    onUpdated: (callback: (payload: OcrUpdatePayload) => void) => () => void;
  };
}

export const ocrInvokeChannels = {
  ocrGet: IPC_CHANNELS.ocr.get,
  ocrEnsure: IPC_CHANNELS.ocr.ensure,
} as const;

export interface OcrInvokeArgsByKey {
  ocrGet: { imageId: number };
  ocrEnsure: { imageId: number };
}

export interface OcrInvokeResultByKey {
  ocrGet: OcrResult;
  ocrEnsure: { available: false } | { available: true; state: OcrResult };
}
