import { IPC_CHANNELS } from '../ipc-channels';

export type ExternalImportAction =
  | 'add-images-to-gallery'
  | 'add-folders-to-gallery'
  | 'add-to-board';

export interface ExternalImportProgress {
  jobId: string;
  action: ExternalImportAction;
  current: number;
  total: number;
  currentPath?: string;
  processed: number;
  skipped: number;
  failed: number;
}

export interface ExternalImportComplete {
  jobId: string;
  action: ExternalImportAction;
  imported: number;
  skipped: number;
  failed: number;
}

export interface ExternalBoardImportRequest {
  jobId: string;
  imageIds: number[];
  imageCount: number;
  skipped: number;
  failed: number;
}

export interface ExternalImportApi {
  externalImport: {
    getPendingBoardImport: () => Promise<ExternalBoardImportRequest | null>;
    addPendingImagesToBoard: (jobId: string, tagId: number) => Promise<{ success: boolean }>;
    dismissPendingBoardImport: (jobId: string) => Promise<{ success: boolean }>;
    onProgress: (callback: (progress: ExternalImportProgress) => void) => () => void;
    onComplete: (callback: (complete: ExternalImportComplete) => void) => () => void;
    onBoardImportRequest: (callback: (request: ExternalBoardImportRequest) => void) => () => void;
  };
}

export const externalImportInvokeChannels = {
  externalImportGetPendingBoardImport: IPC_CHANNELS.externalImport.getPendingBoardImport,
  externalImportAddPendingImagesToBoard: IPC_CHANNELS.externalImport.addPendingImagesToBoard,
  externalImportDismissPendingBoardImport: IPC_CHANNELS.externalImport.dismissPendingBoardImport,
} as const;

export interface ExternalImportInvokeArgsByKey {
  externalImportGetPendingBoardImport: undefined;
  externalImportAddPendingImagesToBoard: { jobId: string; tagId: number };
  externalImportDismissPendingBoardImport: { jobId: string };
}

export interface ExternalImportInvokeResultByKey {
  externalImportGetPendingBoardImport: ExternalBoardImportRequest | null;
  externalImportAddPendingImagesToBoard: { success: boolean };
  externalImportDismissPendingBoardImport: { success: boolean };
}
