import { create } from 'zustand';
import { invalidateCollections } from '../collectionInvalidation';
import { DuplicateGroup, DuplicateScanProgress, HashScanResult } from 'shared';
import { getIpcErrorMessage, runIpcTask } from '../ipc';
import { type OperationHandle, runOperation } from '../operations/runOperation';

interface CleanupStore {
  duplicateGroups: DuplicateGroup[];
  loading: boolean;
  error: string | null;
  scanning: boolean;
  scanProgress: DuplicateScanProgress | null;
  scanHandle: OperationHandle<HashScanResult> | null;

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
  scanHandle: null,

  setError: (error) => set({ error }),

  scanForDuplicates: async () => {
    set({
      scanning: true,
      error: null,
      scanProgress: { phase: 'hashing', current: 0, total: 0 },
      scanHandle: null,
    });
    const handle = runOperation({
      subscribe: window.sortieAPI.onHashProgress,
      start: window.sortieAPI.computeMissingHashes,
      onProgress: (progress) => set({ scanProgress: { phase: 'hashing', ...progress } }),
    });
    set({ scanHandle: handle });

    await runIpcTask({
      run: async () => {
        const hashResult = await handle.result;
        if (hashResult.cancelled) {
          return null;
        }

        set({ scanProgress: { phase: 'comparing', current: 0, total: 0 } });
        return await window.sortieAPI.findDuplicateGroups();
      },
      onSuccess: (groups) => {
        if (groups === null) {
          set({ scanning: false, scanProgress: null, scanHandle: null });
          return;
        }

        set({
          duplicateGroups: groups,
          scanning: false,
          scanProgress: { phase: 'done', current: 0, total: 0 },
          scanHandle: null,
        });
      },
      onError: (message) => {
        set({ error: message, scanning: false, scanProgress: null, scanHandle: null });
      },
    });
  },

  cancelScan: async () => {
    const handle = get().scanHandle;
    if (!handle) return;
    await runIpcTask({
      run: handle.cancel,
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
      await invalidateCollections();
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
