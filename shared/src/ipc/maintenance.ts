import type {
  BackfillExifResult,
  DuplicateGroup,
  FaceScanProgress,
  FaceScanResult,
  HashScanResult,
} from '../types';
import { IPC_CHANNELS } from '../ipc-channels';
import type { SortieProgress } from './common';

export interface MaintenanceApi {
  cancelOperation: (opId: string) => Promise<{ cancelled: boolean }>;
  computeMissingPalettes: (opId: string) => Promise<{ computed: number; cancelled: boolean }>;
  onPaletteProgress: (callback: (progress: SortieProgress) => void) => () => void;
  computeMissingHashes: (opId: string) => Promise<HashScanResult>;
  findDuplicateGroups: () => Promise<DuplicateGroup[]>;
  dismissDuplicatePair: (imageId1: number, imageId2: number) => Promise<{ success: boolean }>;
  deleteImage: (imageId: number) => Promise<{ success: boolean }>;
  onHashProgress: (callback: (progress: SortieProgress) => void) => () => void;
  onScanProgress: (callback: (progress: SortieProgress) => void) => () => void;
  backfillExif: (opId: string) => Promise<BackfillExifResult>;
  processFaces: (opId: string) => Promise<FaceScanResult>;
  resetFaceData: () => Promise<{ success: boolean }>;
  onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) => () => void;
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
