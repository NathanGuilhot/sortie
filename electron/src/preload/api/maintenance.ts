import { type OperationFaceScanProgress, type OperationProgress, type SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithImageId, invokeWithOpId, subscribeEvent } from '../helpers';

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
    onPaletteProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('paletteProgress', callback),
    computeMissingHashes: (opId: string) => invokeWithOpId('computeMissingHashes', opId),
    findDuplicateGroups: () => invokeNone('findDuplicateGroups'),
    dismissDuplicatePair: (imageId1: number, imageId2: number) =>
      invoke('dismissDuplicatePair', { imageId1, imageId2 }),
    deleteImage: (imageId: number) => invokeWithImageId('deleteImage', imageId),
    onHashProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('hashProgress', callback),
    onScanProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('scanProgress', callback),
    backfillExif: (opId: string) => invokeWithOpId('backfillExif', opId),
    processFaces: (opId: string) => invokeWithOpId('processFaces', opId),
    resetFaceData: () => invokeNone('resetFaceData'),
    onFaceScanProgress: (callback: (progress: OperationFaceScanProgress) => void) =>
      subscribeEvent('faceScanProgress', callback),
    resetDatabase: () => invokeNone('resetDatabase'),
  };
}
