import { IPC_EVENTS, type FaceScanProgress, type SortieAPI, type SortieProgress } from 'shared';
import { invoke, invokeNone, invokeWithImageId, invokeWithOpId, subscribe } from '../helpers';

export function createMaintenanceApi(): Pick<
  SortieAPI,
  | 'cancelOperation'
  | 'computeMissingPalettes'
  | 'onPaletteProgress'
  | 'computeMissingHashes'
  | 'findDuplicateGroups'
  | 'dismissDuplicatePair'
  | 'deleteImage'
  | 'onHashProgress'
  | 'onScanProgress'
  | 'backfillExif'
  | 'processFaces'
  | 'resetFaceData'
  | 'onFaceScanProgress'
  | 'resetDatabase'
> {
  return {
    cancelOperation: (opId: string) => invokeWithOpId('cancelOperation', opId),
    computeMissingPalettes: (opId: string) => invokeWithOpId('computeMissingPalettes', opId),
    onPaletteProgress: (callback: (progress: SortieProgress) => void) =>
      subscribe<SortieProgress>(IPC_EVENTS.paletteProgress, callback),
    computeMissingHashes: (opId: string) => invokeWithOpId('computeMissingHashes', opId),
    findDuplicateGroups: () => invokeNone('findDuplicateGroups'),
    dismissDuplicatePair: (imageId1: number, imageId2: number) =>
      invoke('dismissDuplicatePair', { imageId1, imageId2 }),
    deleteImage: (imageId: number) => invokeWithImageId('deleteImage', imageId),
    onHashProgress: (callback: (progress: SortieProgress) => void) =>
      subscribe<SortieProgress>(IPC_EVENTS.hashProgress, callback),
    onScanProgress: (callback: (progress: SortieProgress) => void) =>
      subscribe<SortieProgress>(IPC_EVENTS.scanProgress, callback),
    backfillExif: (opId: string) => invokeWithOpId('backfillExif', opId),
    processFaces: (opId: string) => invokeWithOpId('processFaces', opId),
    resetFaceData: () => invokeNone('resetFaceData'),
    onFaceScanProgress: (callback: (progress: FaceScanProgress) => void) =>
      subscribe<FaceScanProgress>(IPC_EVENTS.faceScanProgress, callback),
    resetDatabase: () => invokeNone('resetDatabase'),
  };
}
