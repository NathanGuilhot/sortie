import { type FolderAvailabilityChange, type SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithPath, subscribeEvent } from '../helpers';

export function createFolderApi(): Pick<
  SortieAPI,
  | 'addFolder'
  | 'scanFolder'
  | 'getFolders'
  | 'getFoldersWithStats'
  | 'removeFolder'
  | 'watchFolder'
  | 'unwatchFolder'
  | 'setFolderFaceScanExclusion'
  | 'suggestDefaultPhotoFolder'
  | 'recheckFolderAvailability'
  | 'onFolderAvailability'
> {
  return {
    addFolder: (path: string) => invokeWithPath('addFolder', path),
    scanFolder: (path: string, opId: string) => invoke('scanFolder', { path, opId }),
    getFolders: () => invokeNone('getFolders'),
    getFoldersWithStats: () => invokeNone('getFoldersWithStats'),
    removeFolder: (path: string) => invokeWithPath('removeFolder', path),
    watchFolder: (path: string) => invokeWithPath('watchFolder', path),
    unwatchFolder: (path: string) => invokeWithPath('unwatchFolder', path),
    setFolderFaceScanExclusion: (path: string, excluded: boolean) =>
      invoke('setFolderFaceScanExclusion', { path, excluded }),
    suggestDefaultPhotoFolder: () => invokeNone('suggestDefaultPhotoFolder'),
    recheckFolderAvailability: (folderPath?: string) =>
      invoke('recheckFolderAvailability', { path: folderPath }),
    onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) =>
      subscribeEvent('folderAvailabilityChanged', callback),
  };
}
