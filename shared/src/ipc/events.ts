import type { EmbedderStatus, FaceScanProgress, OcrUpdatePayload } from '../types';
import type {
  ExternalBoardImportRequest,
  ExternalImportComplete,
  ExternalImportProgress,
} from './external-import';
import type { FolderAvailabilityChange, SortieProgress } from './common';
import type { PinterestBulkImportProgress, PinterestBulkImportSummary } from '../types/pinterest';

/** Progress emitted by operations that may run concurrently in one renderer. */
export interface OperationProgress extends SortieProgress {
  opId: string;
}

export type OperationFaceScanProgress = FaceScanProgress & { opId: string };

export const IPC_EVENT_CHANNELS = {
  embedderStatus: 'embedder-status',
  paletteProgress: 'palette-progress',
  hashProgress: 'hash-progress',
  scanProgress: 'scan-progress',
  faceScanProgress: 'face-scan-progress',
  folderAvailabilityChanged: 'folder-availability-changed',
  showAbout: 'show-about',
  ocrUpdated: 'ocr-updated',
  pinterestBulkImportProgress: 'pinterest:bulk-import-progress',
  pinterestBulkImportComplete: 'pinterest:bulk-import-complete',
  originBackfillComplete: 'origin-backfill-complete',
  externalImportProgress: 'external-import:progress',
  externalImportComplete: 'external-import:complete',
  externalImportBoardRequest: 'external-import:board-request',
} as const;

export type EventKey = keyof typeof IPC_EVENT_CHANNELS;

export interface EventPayloadByKey {
  embedderStatus: EmbedderStatus;
  paletteProgress: OperationProgress;
  hashProgress: OperationProgress;
  scanProgress: OperationProgress;
  faceScanProgress: OperationFaceScanProgress;
  folderAvailabilityChanged: FolderAvailabilityChange;
  showAbout: void;
  ocrUpdated: OcrUpdatePayload;
  pinterestBulkImportProgress: PinterestBulkImportProgress;
  pinterestBulkImportComplete: PinterestBulkImportSummary;
  originBackfillComplete: { filled: number };
  externalImportProgress: ExternalImportProgress;
  externalImportComplete: ExternalImportComplete;
  externalImportBoardRequest: ExternalBoardImportRequest;
}
