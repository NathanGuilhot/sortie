import { useState, useEffect, useCallback } from 'react';
import { ScreenShell, StatHeader, EmptyState, PrimaryButton } from './screen';
import { toast } from '../stores/toastStore';
import { useFolderStore } from '../stores/folderStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import { showIpcError } from '../ipc';
import { FolderScannerCard } from './FolderScannerCard';
import { PlusIcon as PlusIconSvg, FolderPlusIcon as FolderPlusIconSvg } from './icons';
import { formatSize } from './folderScannerUtils';

const PlusIcon = <PlusIconSvg />;
const FolderPlusIcon = <FolderPlusIconSvg />;

export function FolderScanner() {
  const refreshFolderStore = useFolderStore((s) => s.load);
  const folders = useFolderStore((s) => s.folderStats);
  const refreshFolderStats = useFolderStore((s) => s.loadStats);
  const [loading, setLoading] = useState(true);
  const [scanningFolder, setScanningFolder] = useState<string | null>(null);
  const [scanOpId, setScanOpId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);
  const [resettingDb, setResettingDb] = useState(false);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      await refreshFolderStats();
      void refreshFolderStore();
    } catch (error) {
      showIpcError(error);
    } finally {
      setLoading(false);
    }
  }, [refreshFolderStats, refreshFolderStore]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const handleAddFolder = async () => {
    try {
      const selected = await window.sortieAPI.pickFolder();
      if (!selected) return;
      const { overlap } = await window.sortieAPI.addFolder(selected);
      if (overlap.parents.length > 0 || overlap.children.length > 0) {
        toast.info(
          'This folder overlaps with another watched folder — Sortie deduplicates events and preserves metadata.',
        );
      }
      await loadFolders();

      const opId = crypto.randomUUID();
      setScanningFolder(selected);
      setScanOpId(opId);
      setScanProgress(null);
      const unsubscribe = window.sortieAPI.onScanProgress((progress) => {
        setScanProgress(progress);
      });
      try {
        await window.sortieAPI.scanFolder(selected, opId);
      } finally {
        unsubscribe();
      }
      setScanningFolder(null);
      setScanOpId(null);
      setScanProgress(null);
      await loadFolders();
    } catch (error) {
      showIpcError(error);
      setScanningFolder(null);
      setScanOpId(null);
      setScanProgress(null);
    }
  };

  const handleScanFolder = async (path: string) => {
    const opId = crypto.randomUUID();
    setScanningFolder(path);
    setScanOpId(opId);
    setScanProgress(null);
    const unsubscribe = window.sortieAPI.onScanProgress((progress) => {
      setScanProgress(progress);
    });
    try {
      await window.sortieAPI.scanFolder(path, opId);
      await loadFolders();
    } catch (error) {
      showIpcError(error);
    } finally {
      unsubscribe();
      setScanningFolder(null);
      setScanOpId(null);
      setScanProgress(null);
    }
  };

  const handleCancelScan = async () => {
    if (!scanOpId) return;
    try {
      await window.sortieAPI.cancelOperation(scanOpId);
    } catch (error) {
      showIpcError(error);
    }
  };

  const handleWatchToggle = async (path: string, currentlyWatched: boolean) => {
    try {
      if (currentlyWatched) {
        await window.sortieAPI.unwatchFolder(path);
      } else {
        await window.sortieAPI.watchFolder(path);
      }
      await loadFolders();
    } catch (error) {
      showIpcError(error);
    }
  };

  const handleFaceScanExclusionToggle = async (path: string, currentlyExcluded: boolean) => {
    if (!currentlyExcluded) {
      const ok = window.confirm(
        'Exclude this folder from face scanning? Existing face detections in this folder will be deleted.',
      );
      if (!ok) return;
    }
    try {
      await window.sortieAPI.setFolderFaceScanExclusion(path, !currentlyExcluded);
      await loadFolders();
    } catch (error) {
      showIpcError(error);
    }
  };

  const handleRemoveFolder = async (folderPath: string) => {
    if (removingFolder !== folderPath) {
      setRemovingFolder(folderPath);
      return;
    }
    try {
      await window.sortieAPI.removeFolder(folderPath);
      setRemovingFolder(null);
      await loadFolders();
    } catch (error) {
      showIpcError(error);
      setRemovingFolder(null);
    }
  };

  const handleResetDatabase = async () => {
    if (!resettingDb) {
      setResettingDb(true);
      return;
    }
    try {
      await window.sortieAPI.resetDatabase();
      setResettingDb(false);
      await loadFolders();
      // Reset wipes app_settings too — rehydrate so the takeover reappears.
      await useOnboardingStore.getState().load();
    } catch (error) {
      showIpcError(error);
      setResettingDb(false);
    }
  };

  const totalImages = folders.reduce((sum, f) => sum + f.image_count, 0);
  const totalSize = folders.reduce((sum, f) => sum + f.total_size, 0);

  return (
    <ScreenShell>
      <StatHeader
        stats={[
          { value: folders.length, label: 'Folders' },
          { value: totalImages.toLocaleString(), label: 'Images' },
          { value: formatSize(totalSize), label: 'Total Size' },
        ]}
        action={
          <PrimaryButton icon={PlusIcon} onClick={() => void handleAddFolder()}>
            Add Folder
          </PrimaryButton>
        }
      />

      {loading && folders.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : folders.length === 0 ? (
        <EmptyState
          icon={FolderPlusIcon}
          title="No folders yet"
          description="Add a folder to get started."
          action={
            <PrimaryButton icon={PlusIcon} size="lg" onClick={() => void handleAddFolder()}>
              Add Your First Folder
            </PrimaryButton>
          }
        />
      ) : (
        /* Folder card grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <FolderScannerCard
              key={folder.id}
              folder={folder}
              removingFolder={removingFolder}
              scanningFolder={scanningFolder}
              scanProgress={scanProgress}
              onRemoveFolder={(folderPath) => void handleRemoveFolder(folderPath)}
              onCancelRemove={() => setRemovingFolder(null)}
              onWatchToggle={(folderPath, watched) => void handleWatchToggle(folderPath, watched)}
              onScanFolder={(folderPath) => void handleScanFolder(folderPath)}
              onCancelScan={() => void handleCancelScan()}
              onFaceScanToggle={(folderPath, excluded) =>
                void handleFaceScanExclusionToggle(folderPath, excluded)
              }
            />
          ))}
        </div>
      )}

      {/* Reset database */}
      <div className="mt-12 pt-6 border-t border-gray-200">
        {resettingDb ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-600">Erase all data? This cannot be undone.</span>
            <button
              onClick={() => void handleResetDatabase()}
              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
            >
              Confirm Reset
            </button>
            <button
              onClick={() => setResettingDb(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => void handleResetDatabase()}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            Reset Database
          </button>
        )}
      </div>
    </ScreenShell>
  );
}
