import { IPC_EVENTS, type OcrResult, type OcrUpdatePayload, type SortieAPI } from 'shared';
import { invokeWithImageId, subscribe } from '../helpers';

export function createOcrApi(): Pick<SortieAPI, 'ocr'> {
  return {
    ocr: {
      get: (imageId: number): Promise<OcrResult> => invokeWithImageId('ocrGet', imageId),
      ensure: (imageId: number) => invokeWithImageId('ocrEnsure', imageId),
      onUpdated: (callback: (payload: OcrUpdatePayload) => void) =>
        subscribe<OcrUpdatePayload>(IPC_EVENTS.ocrUpdated, callback),
    },
  };
}
