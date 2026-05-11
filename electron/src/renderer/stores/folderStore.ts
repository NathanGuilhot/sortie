import { create } from 'zustand';
import { Folder, FolderWithStats } from 'shared';

interface FolderStore {
  folders: Folder[];
  folderStats: FolderWithStats[];
  loaded: boolean;
  statsLoaded: boolean;
  load: () => Promise<void>;
  loadStats: () => Promise<void>;
  isWritable: (filePath: string) => boolean;
}

let availabilityUnsub: (() => void) | null = null;

function normalizePathForPrefix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  folderStats: [],
  loaded: false,
  statsLoaded: false,

  load: async () => {
    const folders = await window.sortieAPI.getFolders();
    set({ folders, loaded: true });
    ensureAvailabilitySubscription(set);
  },

  loadStats: async () => {
    const folderStats = await window.sortieAPI.getFoldersWithStats();
    set({ folderStats, statsLoaded: true });
    ensureAvailabilitySubscription(set);
  },

  isWritable: (filePath: string) => {
    const folders = get().folders;
    const normalizedFilePath = normalizePathForPrefix(filePath);
    let best: Folder | null = null;
    for (const folder of folders) {
      const normalizedFolderPath = normalizePathForPrefix(folder.path);
      if (
        normalizedFilePath === normalizedFolderPath ||
        normalizedFilePath.startsWith(`${normalizedFolderPath}/`)
      ) {
        if (!best || folder.path.length > best.path.length) best = folder;
      }
    }
    if (!best) return true;
    return best.writable && best.available;
  },
}));

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
