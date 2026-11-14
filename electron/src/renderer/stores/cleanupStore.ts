import { create } from 'zustand';
import { invalidateCollections } from '../collectionInvalidation';
import type {
  DuplicateGroup,
  DuplicateScanProgress,
  DuplicateScanResult,
  DuplicateGroupUpdate,
} from 'shared';
import { getIpcErrorMessage } from '../ipc';
import { type OperationHandle, runOperation } from '../operations/runOperation';

interface CleanupStore {
  duplicateGroups: DuplicateGroup[];
  error: string | null;
  notice: string | null;
  hasScanned: boolean;
  scanning: boolean;
  working: boolean;
  activeGroupId: string | null;
  hasReviewed: boolean;
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
  activeGroupId: null,
  hasReviewed: false,
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
      hasReviewed: false,
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
    set({ working: true, activeGroupId: groupId, error: null });
    try {
      const update = await window.sortieAPI.dismissDuplicateGroup(groupId);
      set((state) => ({
        duplicateGroups: applyGroupUpdate(state.duplicateGroups, update),
        hasReviewed: state.hasReviewed || update.removedGroupIds.length > 0,
        error: update.error ?? null,
      }));
    } catch (error) {
      set({ error: getIpcErrorMessage(error) });
    } finally {
      set({ working: false, activeGroupId: null });
    }
  },

  keepImage: async (groupId, keepId) => {
    if (get().working || get().scanning) return;
    set({ working: true, activeGroupId: groupId, error: null });
    try {
      const result = await window.sortieAPI.keepDuplicate(groupId, keepId);
      set((state) => ({
        duplicateGroups: applyGroupUpdate(state.duplicateGroups, result),
        hasReviewed: state.hasReviewed || result.removedGroupIds.length > 0,
        error:
          result.error ??
          (result.failed.length
            ? `Couldn't finish cleanup for ${result.failed.length} images. ${result.failed[0].message}`
            : null),
      }));
      if (result.removedIds.length || result.pendingRecoveryIds.length) {
        try {
          await invalidateCollections();
        } catch (error) {
          set((state) => ({
            error: [
              state.error,
              `Cleanup results were saved, but library views could not refresh. ${getIpcErrorMessage(error)}`,
            ]
              .filter(Boolean)
              .join(' '),
          }));
        }
      }
    } catch (error) {
      set({ error: getIpcErrorMessage(error) });
    } finally {
      set({ working: false, activeGroupId: null });
    }
  },
}));

function applyGroupUpdate(
  groups: DuplicateGroup[],
  update: DuplicateGroupUpdate,
): DuplicateGroup[] {
  if (!update.removedGroupIds.length && !update.groups.length) return groups;
  const removed = new Set(update.removedGroupIds);
  const next: DuplicateGroup[] = [];
  let inserted = false;
  for (const group of groups) {
    if (removed.has(group.groupId)) {
      if (!inserted) next.push(...update.groups);
      inserted = true;
    } else next.push(group);
  }
  if (!inserted) next.push(...update.groups);
  return next;
}
