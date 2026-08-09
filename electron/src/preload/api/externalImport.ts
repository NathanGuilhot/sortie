import {
  type ExternalBoardImportRequest,
  type ExternalImportComplete,
  type ExternalImportProgress,
  type SortieAPI,
} from 'shared';
import { invoke, invokeNone, subscribeEvent } from '../helpers';

export function createExternalImportApi(): Pick<SortieAPI, 'externalImport'> {
  return {
    externalImport: {
      getPendingBoardImport: () => invokeNone('externalImportGetPendingBoardImport'),
      addPendingImagesToBoard: (jobId: string, tagId: number) =>
        invoke('externalImportAddPendingImagesToBoard', { jobId, tagId }),
      dismissPendingBoardImport: (jobId: string) =>
        invoke('externalImportDismissPendingBoardImport', { jobId }),
      onProgress: (callback: (progress: ExternalImportProgress) => void) =>
        subscribeEvent('externalImportProgress', callback),
      onComplete: (callback: (complete: ExternalImportComplete) => void) =>
        subscribeEvent('externalImportComplete', callback),
      onBoardImportRequest: (callback: (request: ExternalBoardImportRequest) => void) =>
        subscribeEvent('externalImportBoardRequest', callback),
    },
  };
}
