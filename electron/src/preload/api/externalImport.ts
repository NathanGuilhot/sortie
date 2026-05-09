import {
  IPC_EVENTS,
  type ExternalBoardImportRequest,
  type ExternalImportComplete,
  type ExternalImportProgress,
  type SortieAPI,
} from 'shared';
import { invoke, invokeNone, subscribe } from '../helpers';

export function createExternalImportApi(): Pick<SortieAPI, 'externalImport'> {
  return {
    externalImport: {
      getPendingBoardImport: () => invokeNone('externalImportGetPendingBoardImport'),
      addPendingImagesToBoard: (jobId: string, tagId: number) =>
        invoke('externalImportAddPendingImagesToBoard', { jobId, tagId }),
      dismissPendingBoardImport: (jobId: string) =>
        invoke('externalImportDismissPendingBoardImport', { jobId }),
      onProgress: (callback: (progress: ExternalImportProgress) => void) =>
        subscribe<ExternalImportProgress>(IPC_EVENTS.externalImportProgress, callback),
      onComplete: (callback: (complete: ExternalImportComplete) => void) =>
        subscribe<ExternalImportComplete>(IPC_EVENTS.externalImportComplete, callback),
      onBoardImportRequest: (callback: (request: ExternalBoardImportRequest) => void) =>
        subscribe<ExternalBoardImportRequest>(IPC_EVENTS.externalImportBoardRequest, callback),
    },
  };
}
