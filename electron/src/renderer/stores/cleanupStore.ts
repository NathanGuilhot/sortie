import { create } from 'zustand';
import { DuplicateGroup, DuplicateScanProgress } from 'shared';

interface CleanupStore {
  duplicateGroups: DuplicateGroup[];
  loading: boolean;
  error: string | null;
  scanning: boolean;
  scanProgress: DuplicateScanProgress | null;
  currentOpId: string | null;

  setError: (error: string | null) => void;
  scanForDuplicates: () => Promise<void>;
  cancelScan: () => Promise<void>;
  findDuplicates: () => Promise<void>;
  dismissPair: (imageId1: number, imageId2: number) => Promise<void>;
  deleteImage: (imageId: number) => Promise<void>;
}

export const useCleanupStore = create<CleanupStore>((set, get) => ({
  duplicateGroups: [],
  loading: false,
  error: null,
  scanning: false,
  scanProgress: null,
  currentOpId: null,

  setError: (error) => set({ error }),

  scanForDuplicates: async () => {
    const opId = crypto.randomUUID();
    set({
      scanning: true,
      error: null,
      scanProgress: { phase: 'hashing', current: 0, total: 0 },
      currentOpId: opId,
    });

    const unsubscribe = window.sortieAPI.onHashProgress((progress) => {
      set({ scanProgress: { phase: 'hashing', ...progress } });
    });

    try {
      const hashResult = await window.sortieAPI.computeMissingHashes(opId);
      unsubscribe();

      if (hashResult.cancelled) {
        set({ scanning: false, scanProgress: null, currentOpId: null });
        return;
      }

      set({ scanProgress: { phase: 'comparing', current: 0, total: 0 } });
      const groups = await window.sortieAPI.findDuplicateGroups();
      set({
        duplicateGroups: groups,
        scanning: false,
        scanProgress: { phase: 'done', current: 0, total: 0 },
        currentOpId: null,
      });
    } catch (error: unknown) {
      unsubscribe();
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, scanning: false, scanProgress: null, currentOpId: null });
    }
  },

  cancelScan: async () => {
    const opId = get().currentOpId;
    if (!opId) return;
    try {
      await window.sortieAPI.cancelOperation(opId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  findDuplicates: async () => {
    set({ loading: true, error: null });
    try {
      const groups = await window.sortieAPI.findDuplicateGroups();
      set({ duplicateGroups: groups, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },

  dismissPair: async (imageId1: number, imageId2: number) => {
    try {
      await window.sortieAPI.dismissDuplicatePair(imageId1, imageId2);
      await get().findDuplicates();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },

  deleteImage: async (imageId: number) => {
    try {
      await window.sortieAPI.deleteImage(imageId);
      set((state) => ({
        duplicateGroups: state.duplicateGroups
          .map((g) => ({
            ...g,
            images: g.images.filter((img: { id: number }) => img.id !== imageId),
          }))
          .filter((g) => g.images.length >= 2),
      }));
    } catch (error: unknown) {
      throw new Error(cleanIpcErrorMessage(error), { cause: error });
    }
  },
}));

function cleanIpcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  // Electron's ipcRenderer.invoke wraps thrown errors with a preamble like
  // "Error invoking remote method 'delete-image': Error: <original>".
  // Strip it so the UI shows just the underlying message.
  const match = raw.match(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)$/s);
  return match ? match[1] : raw;
}
