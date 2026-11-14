import { type OperationProgress, type SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithImageId, invokeWithOpId, subscribeEvent } from '../helpers';

export function createMaintenanceApi(): Pick<
  SortieAPI,
  | 'cancelOperation'
  | 'computeMissingPalettes'
  | 'onPaletteProgress'
  | 'scanDuplicates'
  | 'dismissDuplicateGroup'
  | 'keepDuplicate'
  | 'deleteImage'
  | 'onHashProgress'
  | 'onScanProgress'
  | 'backfillExif'
  | 'resetDatabase'
> {
  return {
    cancelOperation: (opId: string) => invokeWithOpId('cancelOperation', opId),
    computeMissingPalettes: (opId: string) => invokeWithOpId('computeMissingPalettes', opId),
    onPaletteProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('paletteProgress', callback),
    scanDuplicates: (opId: string) => invokeWithOpId('scanDuplicates', opId),
    dismissDuplicateGroup: (groupId: string) => invoke('dismissDuplicateGroup', { groupId }),
    keepDuplicate: (groupId: string, keepId: number) =>
      invoke('keepDuplicate', { groupId, keepId }),
    deleteImage: (imageId: number) => invokeWithImageId('deleteImage', imageId),
    onHashProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('hashProgress', callback),
    onScanProgress: (callback: (progress: OperationProgress) => void) =>
      subscribeEvent('scanProgress', callback),
    backfillExif: (opId: string) => invokeWithOpId('backfillExif', opId),
    resetDatabase: () => invokeNone('resetDatabase'),
  };
}
