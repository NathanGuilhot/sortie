import { create } from 'zustand';
import { DuplicateGroup, DuplicateScanProgress } from 'shared';
import { getIpcErrorMessage, runIpcTask } from '../ipc';

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

    await runIpcTask({
      run: async () => {
        const hashResult = await window.sortieAPI.computeMissingHashes(opId);
        if (hashResult.cancelled) {
          return null;
        }

        set({ scanProgress: { phase: 'comparing', current: 0, total: 0 } });
        return await window.sortieAPI.findDuplicateGroups();
      },
      onSuccess: (groups) => {
        if (groups === null) {
          set({ scanning: false, scanProgress: null, currentOpId: null });
          return;
        }

        set({
          duplicateGroups: groups,
          scanning: false,
          scanProgress: { phase: 'done', current: 0, total: 0 },
          currentOpId: null,
        });
      },
      onError: (message) => {
        set({ error: message, scanning: false, scanProgress: null, currentOpId: null });
      },
      onFinally: unsubscribe,
    });
  },

  cancelScan: async () => {
    const opId = get().currentOpId;
    if (!opId) return;
    await runIpcTask({
      run: () => window.sortieAPI.cancelOperation(opId),
      onError: (message) => set({ error: message }),
    });
  },

  findDuplicates: async () => {
    set({ loading: true, error: null });
    await runIpcTask({
      run: () => window.sortieAPI.findDuplicateGroups(),
      onSuccess: (groups) => set({ duplicateGroups: groups, loading: false }),
      onError: (message) => set({ error: message, loading: false }),
    });
  },

  dismissPair: async (imageId1: number, imageId2: number) => {
    await runIpcTask({
      run: () => window.sortieAPI.dismissDuplicatePair(imageId1, imageId2),
      onSuccess: async () => {
        await get().findDuplicates();
      },
      onError: (message) => set({ error: message }),
    });
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
    } catch (error) {
      throw new Error(getIpcErrorMessage(error), { cause: error });
    }
  },
}));
