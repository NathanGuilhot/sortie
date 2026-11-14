import { create } from 'zustand';
import { invalidateCollections } from '../collectionInvalidation';
import type { DuplicateGroup, DuplicateScanProgress, DuplicateScanResult } from 'shared';
import { getIpcErrorMessage } from '../ipc';
import { type OperationHandle, runOperation } from '../operations/runOperation';

interface CleanupStore {
  duplicateGroups: DuplicateGroup[];
  error: string | null;
  notice: string | null;
  hasScanned: boolean;
  scanning: boolean;
  working: boolean;
  scanProgress: DuplicateScanProgress | null;
  scanHandle: OperationHandle<DuplicateScanResult> | null;
  setError: (error: string | null) => void;
  scanForDuplicates: () => Promise<void>;
  cancelScan: () => Promise<void>;
  dismissGroup: (groupId: string) => Promise<void>;
  keepImage: (groupId: string, keepId: number) => Promise<void>;
}

export const useCleanupStore = create<CleanupStore>((set, get) => ({
  duplicateGroups: [],
  error: null,
  notice: null,
  hasScanned: false,
  scanning: false,
  working: false,
  scanProgress: null,
  scanHandle: null,
  setError: (error) => set({ error }),

  scanForDuplicates: async () => {
    if (get().scanning || get().working) return;
    set({
      scanning: true,
      error: null,
      notice: null,
      hasScanned: false,
      duplicateGroups: [],
      scanProgress: { phase: 'hashing', current: 0, total: 0 },
    });
    const handle = runOperation({
      subscribe: window.sortieAPI.onHashProgress,
      start: window.sortieAPI.scanDuplicates,
      onProgress: (progress) => set({ scanProgress: { phase: 'hashing', ...progress } }),
    });
    set({ scanHandle: handle });
    try {
      const result = await handle.result;
      if (get().scanHandle !== handle) return;
      if (!result.cancelled) {
        const notices: string[] = [];
        if (result.failed)
          notices.push(`${result.failed} images could not be checked. Try scanning again.`);
        if (result.exactOnly)
          notices.push(`${result.exactOnly} images could only be checked for identical copies.`);
        set({
          duplicateGroups: result.groups,
          hasScanned: true,
          notice: notices.join(' ') || null,
        });
      }
    } catch (error) {
      if (get().scanHandle === handle) set({ error: getIpcErrorMessage(error) });
    } finally {
      if (get().scanHandle === handle)
        set({ scanning: false, scanProgress: null, scanHandle: null });
    }
  },

  cancelScan: async () => {
    try {
      await get().scanHandle?.cancel();
    } catch (error) {
      set({ error: getIpcErrorMessage(error) });
    }
  },

  dismissGroup: async (groupId) => {
    if (get().working || get().scanning) return;
    set({ working: true, error: null });
    try {
      await window.sortieAPI.dismissDuplicateGroup(groupId);
      set({ working: false, duplicateGroups: [] });
      await get().scanForDuplicates();
    } catch (error) {
      set({ error: getIpcErrorMessage(error) });
    } finally {
      set({ working: false });
    }
  },

  keepImage: async (groupId, keepId) => {
    if (get().working || get().scanning) return;
    set({ working: true, error: null });
    try {
      const result = await window.sortieAPI.keepDuplicate(groupId, keepId);
      if (result.removedIds.length) {
        set({ duplicateGroups: [] });
        await invalidateCollections();
        set({ working: false });
        await get().scanForDuplicates();
      }
      if (result.failed.length)
        set({
          error: `Couldn't move ${result.failed.length} images to Trash. ${result.failed[0].message}`,
        });
    } catch (error) {
      set({ duplicateGroups: [], error: getIpcErrorMessage(error) });
    } finally {
      set({ working: false });
    }
  },
}));
