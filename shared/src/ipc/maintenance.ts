import type {
  BackfillExifResult,
  DuplicateCleanupResult,
  DuplicateGroupUpdate,
  DuplicateScanResult,
} from '../types';
import { IPC_CHANNELS } from '../ipc-channels';
import type { OperationProgress } from './events';

export interface MaintenanceApi {
  cancelOperation: (opId: string) => Promise<{ cancelled: boolean }>;
  computeMissingPalettes: (opId: string) => Promise<{ computed: number; cancelled: boolean }>;
  onPaletteProgress: (callback: (progress: OperationProgress) => void) => () => void;
  scanDuplicates: (opId: string) => Promise<DuplicateScanResult>;
  dismissDuplicateGroup: (groupId: string) => Promise<DuplicateGroupUpdate>;
  keepDuplicate: (groupId: string, keepId: number) => Promise<DuplicateCleanupResult>;
  deleteImage: (imageId: number) => Promise<{ success: boolean }>;
  onHashProgress: (callback: (progress: OperationProgress) => void) => () => void;
  onScanProgress: (callback: (progress: OperationProgress) => void) => () => void;
  backfillExif: (opId: string) => Promise<BackfillExifResult>;
  resetDatabase: () => Promise<{ success: boolean }>;
}

export const maintenanceInvokeChannels = {
  cancelOperation: IPC_CHANNELS.cancelOperation,
  computeMissingPalettes: IPC_CHANNELS.computeMissingPalettes,
  scanDuplicates: IPC_CHANNELS.scanDuplicates,
  dismissDuplicateGroup: IPC_CHANNELS.dismissDuplicateGroup,
  keepDuplicate: IPC_CHANNELS.keepDuplicate,
  deleteImage: IPC_CHANNELS.deleteImage,
  backfillExif: IPC_CHANNELS.backfillExif,
  resetDatabase: IPC_CHANNELS.resetDatabase,
} as const;

export interface MaintenanceInvokeArgsByKey {
  cancelOperation: { opId: string };
  computeMissingPalettes: { opId: string };
  scanDuplicates: { opId: string };
  dismissDuplicateGroup: { groupId: string };
  keepDuplicate: { groupId: string; keepId: number };
  deleteImage: { imageId: number };
  backfillExif: { opId: string };
  resetDatabase: undefined;
}

export interface MaintenanceInvokeResultByKey {
  cancelOperation: { cancelled: boolean };
  computeMissingPalettes: { computed: number; cancelled: boolean };
  scanDuplicates: DuplicateScanResult;
  dismissDuplicateGroup: DuplicateGroupUpdate;
  keepDuplicate: DuplicateCleanupResult;
  deleteImage: { success: boolean };
  backfillExif: BackfillExifResult;
  resetDatabase: { success: boolean };
}
