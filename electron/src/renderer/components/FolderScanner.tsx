import { useState, useEffect, useCallback } from 'react';
import { FolderWithStats } from 'shared';
import { CopyText } from './CopyText';
import { ScreenShell, StatHeader, EmptyState, PrimaryButton } from './screen';
import { toast } from '../stores/toastStore';
import { useFolderStore } from '../stores/folderStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import {
  PlusIcon as PlusIconSvg,
  FolderPlusIcon as FolderPlusIconSvg,
  TrashIcon,
  PhotoIcon,
  RefreshIcon,
} from './icons';

const PlusIcon = <PlusIconSvg />;
const FolderPlusIcon = <FolderPlusIconSvg />;

function formatRelativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export function FolderScanner() {
  const refreshFolderStore = useFolderStore((s) => s.load);
  const [folders, setFolders] = useState<FolderWithStats[]>([]);
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
      const data = await window.sortieAPI.getFoldersWithStats();
      setFolders(data);
      void refreshFolderStore();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [refreshFolderStore]);

  useEffect(() => {
    void loadFolders();
    const unsubscribe = window.sortieAPI.onFolderAvailability((change) => {
      setFolders((prev) =>
        prev.map((f) =>
          f.path === change.path
            ? { ...f, available: change.available, writable: change.writable }
            : f,
        ),
      );
    });
    return unsubscribe;
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
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
            <div
              key={folder.id}
              className={`rounded-lg border p-5 hover:shadow-md transition-shadow duration-150 ${
                folder.available
                  ? 'bg-white border-gray-200'
                  : 'bg-gray-50 border-gray-200 opacity-75'
              }`}
            >
              {/* Top row: folder name + remove */}
              <div className="flex items-start justify-between mb-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`text-sm font-semibold truncate ${
                        folder.available ? 'text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {folder.folder_name}
                    </h3>
                    {!folder.available && (
                      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-amber-100 text-amber-700 border border-amber-200">
                        Drive offline
                      </span>
                    )}
                    {!!folder.available && !folder.writable && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-amber-50 text-amber-700 border border-amber-200"
                        title="This volume is read-only. Files in this folder cannot be deleted from Sortie."
                      >
                        Read-only
                      </span>
                    )}
                  </div>
                  <CopyText
                    value={folder.path}
                    className="text-xs text-gray-400 truncate mt-0.5 block"
                    title={folder.path}
                  >
                    {folder.path}
                  </CopyText>
                </div>
                {removingFolder === folder.path ? (
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => void handleRemoveFolder(folder.path)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setRemovingFolder(null)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleRemoveFolder(folder.path)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0 cursor-pointer"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <PhotoIcon className="w-3.5 h-3.5" strokeWidth={2} />
                  {folder.image_count.toLocaleString()} images
                </span>
                <span>{formatSize(folder.total_size)}</span>
                {folder.last_scanned && (
                  <span>Scanned {formatRelativeTime(folder.last_scanned)}</span>
                )}
              </div>

              {/* Scan progress */}
              {scanningFolder === folder.path && scanProgress && scanProgress.total > 0 && (
                <div className="mt-3">
                  <div className="w-full bg-lavender/40 rounded-full h-1.5">
                    <div
                      className="bg-ink h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <p
                    className="text-xs text-gray-400 mt-1 truncate"
                    title={scanProgress.currentFile}
                  >
                    {scanProgress.currentFile.split('/').pop()}
                  </p>
                </div>
              )}

              {/* Bottom row: watch toggle + scan */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => void handleWatchToggle(folder.path, folder.watched)}
                  disabled={!folder.available}
                  className="flex items-center gap-2 text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div
                    className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                      folder.watched ? 'bg-mint' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200 ${
                        folder.watched ? 'translate-x-[19px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </div>
                  <span className={folder.watched ? 'text-ink' : 'text-gray-500'}>
                    {folder.watched ? 'Watching' : 'Paused'}
                  </span>
                </button>

                {scanningFolder === folder.path ? (
                  <button
                    onClick={() => void handleCancelScan()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                  >
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-red-300 border-t-red-600" />
                    Cancel
                    {scanProgress ? ` (${scanProgress.current}/${scanProgress.total})` : ''}
                  </button>
                ) : (
                  <button
                    onClick={() => void handleScanFolder(folder.path)}
                    disabled={scanningFolder !== null || !folder.available}
                    title={!folder.available ? 'Drive offline' : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink hover:bg-lavender/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <RefreshIcon className="w-3.5 h-3.5" />
                    Scan Now
                  </button>
                )}
              </div>

              {/* Face scan exclusion */}
              <div className="flex items-center mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() =>
                    void handleFaceScanExclusionToggle(folder.path, folder.exclude_from_face_scan)
                  }
                  disabled={!folder.available}
                  title={
                    folder.exclude_from_face_scan
                      ? 'Re-enable face scanning for this folder'
                      : 'Exclude this folder from face scanning (deletes existing detections)'
                  }
                  className="flex items-center gap-2 text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div
                    className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                      folder.exclude_from_face_scan ? 'bg-gray-300' : 'bg-mint'
                    }`}
                  >
                    <div
                      className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200 ${
                        folder.exclude_from_face_scan ? 'translate-x-[3px]' : 'translate-x-[19px]'
                      }`}
                    />
                  </div>
                  <span className={folder.exclude_from_face_scan ? 'text-gray-500' : 'text-ink'}>
                    {folder.exclude_from_face_scan ? 'Face scan off' : 'Face scan on'}
                  </span>
                </button>
              </div>
            </div>
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
