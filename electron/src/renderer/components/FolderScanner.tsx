import { useState, useEffect } from 'react';
import { FolderWithStats } from 'shared';

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
  const [folders, setFolders] = useState<FolderWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanningFolder, setScanningFolder] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);
  const [resettingDb, setResettingDb] = useState(false);

  useEffect(() => {
    void loadFolders();
  }, []);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const data = await window.sortieAPI.getFoldersWithStats();
      setFolders(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFolder = async () => {
    try {
      const selected = await window.sortieAPI.pickFolder();
      if (!selected) return;
      setError(null);
      await window.sortieAPI.addFolder(selected);
      await loadFolders();

      setScanningFolder(selected);
      setScanProgress(null);
      const unsubscribe = window.sortieAPI.onScanProgress((progress) => {
        setScanProgress(progress);
      });
      try {
        await window.sortieAPI.scanFolder(selected);
      } finally {
        unsubscribe();
      }
      setScanningFolder(null);
      setScanProgress(null);
      await loadFolders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setScanningFolder(null);
      setScanProgress(null);
    }
  };

  const handleScanFolder = async (path: string) => {
    setScanningFolder(path);
    setScanProgress(null);
    const unsubscribe = window.sortieAPI.onScanProgress((progress) => {
      setScanProgress(progress);
    });
    try {
      await window.sortieAPI.scanFolder(path);
      await loadFolders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      unsubscribe();
      setScanningFolder(null);
      setScanProgress(null);
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
      setError(message);
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
      setError(message);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResettingDb(false);
    }
  };

  const totalImages = folders.reduce((sum, f) => sum + f.image_count, 0);
  const totalSize = folders.reduce((sum, f) => sum + f.total_size, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-gray-900">{folders.length}</div>
              <div className="text-xs text-gray-500">Folders</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalImages.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Images</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatSize(totalSize)}</div>
              <div className="text-xs text-gray-500">Total Size</div>
            </div>
          </div>
          <button
            onClick={() => void handleAddFolder()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Folder
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between text-sm">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 hover:text-red-600 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Loading skeleton */}
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
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No folders yet</h3>
            <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
              Add a folder to start scanning and organizing your photos with AI tags and search.
            </p>
            <button
              onClick={() => void handleAddFolder()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Your First Folder
            </button>
          </div>
        ) : (
          /* Folder card grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow duration-150"
              >
                {/* Top row: folder name + remove */}
                <div className="flex items-start justify-between mb-1">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {folder.folder_name}
                    </h3>
                    <p className="text-xs text-gray-400 truncate mt-0.5" title={folder.path}>
                      {folder.path}
                    </p>
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
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
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
                    <div className="w-full bg-blue-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
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
                    className="flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <div
                      className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                        folder.watched ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform duration-200 ${
                          folder.watched ? 'translate-x-[16px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </div>
                    <span className={folder.watched ? 'text-green-700' : 'text-gray-500'}>
                      {folder.watched ? 'Watching' : 'Paused'}
                    </span>
                  </button>

                  <button
                    onClick={() => void handleScanFolder(folder.path)}
                    disabled={scanningFolder === folder.path}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {scanningFolder === folder.path ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-300 border-t-blue-600" />
                        {scanProgress
                          ? `${scanProgress.current}/${scanProgress.total}`
                          : 'Scanning...'}
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Scan Now
                      </>
                    )}
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
      </div>
    </div>
  );
}
