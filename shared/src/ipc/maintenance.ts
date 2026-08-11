import type { BackfillExifResult, DuplicateGroup, FaceScanResult, HashScanResult } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';
import type { OperationFaceScanProgress, OperationProgress } from './events';

export interface MaintenanceApi {
  cancelOperation: (opId: string) => Promise<{ cancelled: boolean }>;
  computeMissingPalettes: (opId: string) => Promise<{ computed: number; cancelled: boolean }>;
  onPaletteProgress: (callback: (progress: OperationProgress) => void) => () => void;
  computeMissingHashes: (opId: string) => Promise<HashScanResult>;
  findDuplicateGroups: () => Promise<DuplicateGroup[]>;
  dismissDuplicatePair: (imageId1: number, imageId2: number) => Promise<{ success: boolean }>;
  deleteImage: (imageId: number) => Promise<{ success: boolean }>;
  onHashProgress: (callback: (progress: OperationProgress) => void) => () => void;
  onScanProgress: (callback: (progress: OperationProgress) => void) => () => void;
  backfillExif: (opId: string) => Promise<BackfillExifResult>;
  processFaces: (opId: string) => Promise<FaceScanResult>;
  resetFaceData: () => Promise<{ success: boolean }>;
  onFaceScanProgress: (callback: (progress: OperationFaceScanProgress) => void) => () => void;
  resetDatabase: () => Promise<{ success: boolean }>;
}

export const maintenanceInvokeChannels = {
  cancelOperation: IPC_CHANNELS.cancelOperation,
  computeMissingPalettes: IPC_CHANNELS.computeMissingPalettes,
  computeMissingHashes: IPC_CHANNELS.computeMissingHashes,
  findDuplicateGroups: IPC_CHANNELS.findDuplicateGroups,
  dismissDuplicatePair: IPC_CHANNELS.dismissDuplicatePair,
  deleteImage: IPC_CHANNELS.deleteImage,
  backfillExif: IPC_CHANNELS.backfillExif,
  processFaces: IPC_CHANNELS.processFaces,
  resetFaceData: IPC_CHANNELS.resetFaceData,
  resetDatabase: IPC_CHANNELS.resetDatabase,
} as const;

export interface MaintenanceInvokeArgsByKey {
  cancelOperation: { opId: string };
  computeMissingPalettes: { opId: string };
  computeMissingHashes: { opId: string };
  findDuplicateGroups: undefined;
  dismissDuplicatePair: { imageId1: number; imageId2: number };
  deleteImage: { imageId: number };
  backfillExif: { opId: string };
  processFaces: { opId: string };
  resetFaceData: undefined;
  resetDatabase: undefined;
}

export interface MaintenanceInvokeResultByKey {
  cancelOperation: { cancelled: boolean };
  computeMissingPalettes: { computed: number; cancelled: boolean };
  computeMissingHashes: HashScanResult;
  findDuplicateGroups: DuplicateGroup[];
  dismissDuplicatePair: { success: boolean };
  deleteImage: { success: boolean };
  backfillExif: BackfillExifResult;
  processFaces: FaceScanResult;
  resetFaceData: { success: boolean };
  resetDatabase: { success: boolean };
}
