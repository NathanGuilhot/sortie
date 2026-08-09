import { create } from 'zustand';
import type { OperationProgress, ScanFolderResult } from 'shared';
import { showIpcError } from '../ipc';
import { type OperationHandle, runOperation } from '../operations/runOperation';
import { useFolderStore } from './folderStore';
import { toast } from './toastStore';

export interface FolderScanOptions {
  onMilestone?: () => void | Promise<void>;
}

interface FolderScanStore {
  scanningFolder: string | null;
  scanProgress: OperationProgress | null;
  scanHandle: OperationHandle<ScanFolderResult> | null;
  scanFolder: (path: string, options?: FolderScanOptions) => Promise<void>;
  addFolderAndScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
}

async function refreshFolders(): Promise<void> {
  await Promise.all([useFolderStore.getState().load(), useFolderStore.getState().loadStats()]);
}

export const useFolderScanStore = create<FolderScanStore>((set, get) => ({
  scanningFolder: null,
  scanProgress: null,
  scanHandle: null,

  scanFolder: async (path, options = {}) => {
    if (get().scanHandle) return;

    let lastMilestone = 0;
    let milestoneInFlight = false;
    const handle = runOperation<OperationProgress, ScanFolderResult>({
      subscribe: window.sortieAPI.onScanProgress,
      start: (opId) => window.sortieAPI.scanFolder(path, opId),
      onProgress: (progress) => {
        set({ scanProgress: progress });
        const isMilestone =
          progress.current > 0 &&
          (progress.current - lastMilestone >= 100 || progress.current === progress.total);
        if (!isMilestone || milestoneInFlight || !options.onMilestone) return;

        lastMilestone = progress.current;
        milestoneInFlight = true;
        void Promise.resolve()
          .then(() => options.onMilestone?.())
          .catch(() => {
            // Milestone refreshes are best-effort; the scan itself must continue.
          })
          .finally(() => {
            milestoneInFlight = false;
          });
      },
    });
    set({ scanningFolder: path, scanProgress: null, scanHandle: handle });

    try {
      await handle.result;
      await refreshFolders();
    } catch (error) {
      showIpcError(error);
      throw error;
    } finally {
      if (get().scanHandle === handle) {
        set({ scanningFolder: null, scanProgress: null, scanHandle: null });
      }
    }
  },

  addFolderAndScan: async () => {
    try {
      const selected = await window.sortieAPI.pickFolder();
      if (!selected) return;
      const { overlap } = await window.sortieAPI.addFolder(selected);
      if (overlap.parents.length > 0 || overlap.children.length > 0) {
        toast.info(
          'This folder overlaps with another watched folder — Sortie deduplicates events and preserves metadata.',
        );
      }
      await refreshFolders();
      await get().scanFolder(selected);
    } catch (error) {
      showIpcError(error);
    }
  },

  cancelScan: async () => {
    const handle = get().scanHandle;
    if (!handle) return;
    try {
      await handle.cancel();
    } catch (error) {
      showIpcError(error);
    }
  },
}));
