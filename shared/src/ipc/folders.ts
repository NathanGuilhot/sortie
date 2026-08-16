import type { Folder, FolderStats, ScanFolderResult } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';
import type { FolderAvailabilityChange, SuggestDefaultPhotoFolderResult } from './common';

export interface FolderApi {
  addFolder: (path: string) => Promise<{
    folderId: number;
    overlap: { parents: string[]; children: string[] };
  }>;
  scanFolder: (path: string, opId: string) => Promise<ScanFolderResult>;
  getFolders: () => Promise<Folder[]>;
  getFoldersWithStats: () => Promise<FolderStats>;
  removeFolder: (path: string) => Promise<{ success: boolean }>;
  watchFolder: (path: string) => Promise<{ watching: boolean }>;
  unwatchFolder: (path: string) => Promise<{ watching: boolean }>;
  setFolderFaceScanExclusion: (path: string, excluded: boolean) => Promise<{ changed: boolean }>;
  suggestDefaultPhotoFolder: () => Promise<SuggestDefaultPhotoFolderResult>;
  recheckFolderAvailability: (
    folderPath?: string,
  ) => Promise<{ changes: FolderAvailabilityChange[] }>;
  onFolderAvailability: (callback: (change: FolderAvailabilityChange) => void) => () => void;
}

export const folderInvokeChannels = {
  addFolder: IPC_CHANNELS.addFolder,
  scanFolder: IPC_CHANNELS.scanFolder,
  getFolders: IPC_CHANNELS.getFolders,
  getFoldersWithStats: IPC_CHANNELS.getFoldersWithStats,
  removeFolder: IPC_CHANNELS.removeFolder,
  watchFolder: IPC_CHANNELS.watchFolder,
  unwatchFolder: IPC_CHANNELS.unwatchFolder,
  setFolderFaceScanExclusion: IPC_CHANNELS.setFolderFaceScanExclusion,
  suggestDefaultPhotoFolder: IPC_CHANNELS.suggestDefaultPhotoFolder,
  recheckFolderAvailability: IPC_CHANNELS.recheckFolderAvailability,
} as const;

export interface FolderInvokeArgsByKey {
  addFolder: { path: string };
  scanFolder: { path: string; opId: string };
  getFolders: undefined;
  getFoldersWithStats: undefined;
  removeFolder: { path: string };
  watchFolder: { path: string };
  unwatchFolder: { path: string };
  setFolderFaceScanExclusion: { path: string; excluded: boolean };
  suggestDefaultPhotoFolder: undefined;
  recheckFolderAvailability: { path?: string } | undefined;
}

export interface FolderInvokeResultByKey {
  addFolder: { folderId: number; overlap: { parents: string[]; children: string[] } };
  scanFolder: ScanFolderResult;
  getFolders: Folder[];
  getFoldersWithStats: FolderStats;
  removeFolder: { success: boolean };
  watchFolder: { watching: boolean };
  unwatchFolder: { watching: boolean };
  setFolderFaceScanExclusion: { changed: boolean };
  suggestDefaultPhotoFolder: SuggestDefaultPhotoFolderResult;
  recheckFolderAvailability: { changes: FolderAvailabilityChange[] };
}
