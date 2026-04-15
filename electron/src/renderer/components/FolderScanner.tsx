import React, { useState, useEffect } from 'react';
import { Folder } from 'shared';

interface FolderScannerProps {
  onFolderAdded?: (path: string) => void;
}

export function FolderScanner({ onFolderAdded }: FolderScannerProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [scanningFolder, setScanningFolder] = useState<string | null>(null);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const foldersData = await window.sortieAPI.getFolders();
      setFolders(foldersData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const folderId = await window.sortieAPI.addFolder(newFolderPath);
      console.log('Folder added with ID:', folderId);
      setNewFolderPath('');
      await loadFolders();
      onFolderAdded?.(newFolderPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScanFolder = async (path: string) => {
    setScanningFolder(path);
    try {
      await window.sortieAPI.scanFolder(path);
      // Refresh folders
      await loadFolders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanningFolder(null);
    }
  };

  const handleWatchToggle = async (path: string, currentlyWatched: boolean) => {
    try {
      if (currentlyWatched) {
        await window.sortieAPI.unwatchFolder(path);
      } else {
        // @ts-ignore
        await window.sortieAPI.watchFolder(path);
      }
      await loadFolders();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBrowseFolder = () => {
    // Electron's dialog.showOpenDialog is only available in main process.
    // We'll need to implement IPC for folder picker.
    // For now, just log
    console.log('Browse folder clicked');
    // TODO: Implement folder picker via IPC
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Watched Folders</h2>

      {/* Add folder form */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 mb-4">
          <div className="flex-1">
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="/path/to/your/photos"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
            />
          </div>
          <button
            onClick={handleBrowseFolder}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Browse...
          </button>
          <button
            onClick={handleAddFolder}
            disabled={loading || !newFolderPath.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Folder'}
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Add a folder to watch for new images. Sortie will automatically scan and tag new photos.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Folders list */}
      {loading && folders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Loading folders...</div>
      ) : folders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="text-lg font-medium mb-2">No folders added yet</div>
          <p className="text-sm">Add a folder to start organizing your photos</p>
        </div>
      ) : (
        <div className="space-y-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-900 truncate" title={folder.path}>
                  {folder.path}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleWatchToggle(folder.path, folder.watched)}
                    className={`px-3 py-1 text-sm rounded-full ${folder.watched
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}
                  >
                    {folder.watched ? 'Watching' : 'Paused'}
                  </button>
                  <button
                    onClick={() => handleScanFolder(folder.path)}
                    disabled={scanningFolder === folder.path}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full border border-blue-200 hover:bg-blue-200 disabled:opacity-50"
                  >
                    {scanningFolder === folder.path ? 'Scanning...' : 'Scan Now'}
                  </button>
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <div className="flex-1">
                  Added {new Date(folder.created_at).toLocaleDateString()}
                  {folder.last_scanned && (
                    <> • Last scanned {new Date(folder.last_scanned).toLocaleDateString()}</>
                  )}
                  {folder.ignored && <span className="ml-2 text-amber-600">(Ignored)</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="font-medium text-gray-900 mb-2">How it works</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Watched folders are automatically scanned for new images</li>
          <li>• Images are tagged using AI and EXIF metadata</li>
          <li>• You can pause watching on any folder</li>
          <li>• Manual scanning updates tags for existing images</li>
        </ul>
      </div>
    </div>
  );
}