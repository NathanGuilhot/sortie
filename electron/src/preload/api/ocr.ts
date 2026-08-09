import { type OcrResult, type OcrUpdatePayload, type SortieAPI } from 'shared';
import { invokeWithImageId, subscribeEvent } from '../helpers';

export function createOcrApi(): Pick<SortieAPI, 'ocr'> {
  return {
    ocr: {
      get: (imageId: number): Promise<OcrResult> => invokeWithImageId('ocrGet', imageId),
      ensure: (imageId: number) => invokeWithImageId('ocrEnsure', imageId),
      onUpdated: (callback: (payload: OcrUpdatePayload) => void) =>
        subscribeEvent('ocrUpdated', callback),
    },
  };
}
