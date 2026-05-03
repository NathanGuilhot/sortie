import type { FolderWithStats, SortieProgress } from 'shared';
import { CopyText } from './CopyText';
import { PhotoIcon, RefreshIcon, TrashIcon } from './icons';
import { formatRelativeTime, formatSize } from './folderScannerUtils';

interface FolderScannerCardProps {
  folder: FolderWithStats;
  removingFolder: string | null;
  scanningFolder: string | null;
  scanProgress: SortieProgress | null;
  onRemoveFolder: (folderPath: string) => void;
  onCancelRemove: () => void;
  onWatchToggle: (folderPath: string, watched: boolean) => void;
  onScanFolder: (folderPath: string) => void;
  onCancelScan: () => void;
  onFaceScanToggle: (folderPath: string, excluded: boolean) => void;
}

export function FolderScannerCard({
  folder,
  removingFolder,
  scanningFolder,
  scanProgress,
  onRemoveFolder,
  onCancelRemove,
  onWatchToggle,
  onScanFolder,
  onCancelScan,
  onFaceScanToggle,
}: FolderScannerCardProps) {
  const checkedCount = scanProgress?.current ?? 0;
  const totalCount = scanProgress?.total ?? 0;
  const progressPct = totalCount > 0 ? Math.min(100, Math.max(0, (checkedCount / totalCount) * 100)) : 0;

  return (
    <div
      className={`rounded-lg border p-5 hover:shadow-md transition-shadow duration-150 ${
        folder.available ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-75'
      }`}
    >
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
              onClick={() => onRemoveFolder(folder.path)}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
            >
              Remove
            </button>
            <button
              onClick={onCancelRemove}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => onRemoveFolder(folder.path)}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0 cursor-pointer"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <PhotoIcon className="w-3.5 h-3.5" strokeWidth={2} />
          {folder.image_count.toLocaleString()} images
        </span>
        <span>{formatSize(folder.total_size)}</span>
        {folder.last_scanned && <span>Scanned {formatRelativeTime(folder.last_scanned)}</span>}
      </div>

      {scanningFolder === folder.path && scanProgress && scanProgress.total > 0 && (
        <div className="mt-3">
          <div className="w-full bg-lavender/40 rounded-full h-1.5">
            <div
              className="bg-ink h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Checked {checkedCount.toLocaleString()} / {totalCount.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1 truncate" title={scanProgress.currentFile}>
            {scanProgress.currentFile.split('/').pop()}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => onWatchToggle(folder.path, folder.watched)}
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
            onClick={onCancelScan}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
          >
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-red-300 border-t-red-600" />
            Cancel
            {scanProgress ? ` (${checkedCount}/${totalCount} checked)` : ''}
          </button>
        ) : (
          <button
            onClick={() => onScanFolder(folder.path)}
            disabled={scanningFolder !== null || !folder.available}
            title={!folder.available ? 'Drive offline' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink hover:bg-lavender/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            Scan Now
          </button>
        )}
      </div>

      <div className="flex items-center mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={() => onFaceScanToggle(folder.path, folder.exclude_from_face_scan)}
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
  );
}
