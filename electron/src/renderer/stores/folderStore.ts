import { create } from 'zustand';
import { Folder } from 'shared';

interface FolderStore {
  folders: Folder[];
  loaded: boolean;
  load: () => Promise<void>;
  isWritable: (filePath: string) => boolean;
}

let availabilityUnsub: (() => void) | null = null;

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  loaded: false,

  load: async () => {
    const folders = await window.sortieAPI.getFolders();
    set({ folders, loaded: true });

    if (!availabilityUnsub) {
      availabilityUnsub = window.sortieAPI.onFolderAvailability((change) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.path === change.path
              ? { ...f, available: change.available, writable: change.writable }
              : f,
          ),
        }));
      });
    }
  },

  isWritable: (filePath: string) => {
    const folders = get().folders;
    let best: Folder | null = null;
    for (const folder of folders) {
      if (filePath === folder.path || filePath.startsWith(folder.path + '/')) {
        if (!best || folder.path.length > best.path.length) best = folder;
      }
    }
    if (!best) return true;
    return best.writable && best.available;
  },
}));
