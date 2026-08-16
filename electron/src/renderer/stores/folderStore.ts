import { create } from 'zustand';
import { Folder, FolderWithStats, mostSpecificFolderForPath } from 'shared';
import { onCollectionInvalidation } from '../collectionInvalidation';

interface FolderStore {
  folders: Folder[];
  folderStats: FolderWithStats[];
  totalImages: number;
  totalSize: number;
  loaded: boolean;
  statsLoaded: boolean;
  load: () => Promise<void>;
  loadStats: () => Promise<void>;
  isWritable: (filePath: string) => boolean;
}

let availabilityUnsub: (() => void) | null = null;

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  folderStats: [],
  totalImages: 0,
  totalSize: 0,
  loaded: false,
  statsLoaded: false,

  load: async () => {
    const folders = await window.sortieAPI.getFolders();
    set({ folders, loaded: true });
    ensureAvailabilitySubscription(set);
  },

  loadStats: async () => {
    const stats = await window.sortieAPI.getFoldersWithStats();
    set({
      folderStats: stats.folders,
      totalImages: stats.totalImages,
      totalSize: stats.totalSize,
      statsLoaded: true,
    });
    ensureAvailabilitySubscription(set);
  },

  isWritable: (filePath: string) => {
    const best = mostSpecificFolderForPath(get().folders, filePath);
    if (!best) return true;
    return best.writable && best.available;
  },
}));

onCollectionInvalidation(async () => {
  const state = useFolderStore.getState();
  if (state.statsLoaded) await state.loadStats();
});

function ensureAvailabilitySubscription(
  set: (partial: Partial<FolderStore> | ((state: FolderStore) => Partial<FolderStore>)) => void,
): void {
  if (availabilityUnsub) return;

  availabilityUnsub = window.sortieAPI.onFolderAvailability((change) => {
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.path === change.path
          ? { ...folder, available: change.available, writable: change.writable }
          : folder,
      ),
      folderStats: state.folderStats.map((folder) =>
        folder.path === change.path
          ? { ...folder, available: change.available, writable: change.writable }
          : folder,
      ),
    }));
  });
}
