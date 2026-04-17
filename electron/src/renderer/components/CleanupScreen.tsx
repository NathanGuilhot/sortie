import { useState } from 'react';
import { useCleanupStore } from '../stores/cleanupStore';
import { CopyText } from './CopyText';
import { DuplicateGroup, Image } from 'shared';

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatExt(mimeType: string | null): string {
  if (!mimeType) return '?';
  const map: Record<string, string> = {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/tiff': 'TIFF',
    'image/heic': 'HEIC',
  };
  return map[mimeType] || mimeType.split('/')[1]?.toUpperCase() || '?';
}

function DuplicateGroupCard({
  group,
  onKeep,
  onDismiss,
}: {
  group: DuplicateGroup;
  onKeep: (group: DuplicateGroup, keepId: number) => void;
  onDismiss: (group: DuplicateGroup) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              group.matchType === 'exact'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {group.matchType === 'exact' ? 'Exact Match' : 'Visual Match'}
          </span>
          <span className="text-xs text-gray-400">{group.images.length} files</span>
        </div>
        <button
          onClick={() => onDismiss(group)}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors cursor-pointer"
        >
          Keep All
        </button>
      </div>

      {/* Side-by-side images */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.min(group.images.length, 4)}, 1fr)` }}
      >
        {group.images.map((img: Image) => {
          const others = group.images.filter((o: Image) => o.id !== img.id);
          const othersSize = others.reduce((s: number, o: Image) => s + (o.file_size || 0), 0);
          return (
            <ImageCard
              key={img.id}
              image={img}
              onKeep={() => onKeep(group, img.id)}
              deleteCount={others.length}
              deleteSize={othersSize}
            />
          );
        })}
      </div>
    </div>
  );
}

function ImageCard({
  image,
  onKeep,
  deleteCount,
  deleteSize,
}: {
  image: Image;
  onKeep: () => void;
  deleteCount: number;
  deleteSize: number;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden mb-2">
        <img
          src={`sortie-thumb://${image.file_path}?w=${Math.ceil((300 * (window.devicePixelRatio || 1)) / 100) * 100}`}
          alt={image.file_name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Metadata */}
      <div className="space-y-0.5 mb-2">
        <CopyText value={image.file_name} className="text-xs font-medium text-gray-900 truncate block" title={image.file_name}>
          {image.file_name}
        </CopyText>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatExt(image.mime_type)}</span>
          {image.width && image.height && (
            <>
              <span className="text-gray-300">|</span>
              <span>
                {image.width} x {image.height}
              </span>
            </>
          )}
        </div>
        <p className="text-xs text-gray-400">{formatSize(image.file_size || 0)}</p>
      </div>

      {/* Keep button */}
      {confirming ? (
        <div className="flex gap-1">
          <button
            onClick={() => {
              onKeep();
              setConfirming(false);
            }}
            className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors cursor-pointer"
          >
            Delete {deleteCount} {deleteCount === 1 ? 'file' : 'files'} ({formatSize(deleteSize)})
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-2 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full px-2 py-1.5 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors cursor-pointer"
        >
          Keep this one
        </button>
      )}
    </div>
  );
}

export function CleanupScreen() {
  const {
    duplicateGroups,
    error,
    scanning,
    scanProgress,
    scanForDuplicates,
    dismissPair,
    deleteImage,
    setError,
  } = useCleanupStore();

  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = async () => {
    await scanForDuplicates();
    setHasScanned(true);
  };

  const handleKeep = async (group: DuplicateGroup, keepImageId: number) => {
    const toDelete = group.images.filter((img: Image) => img.id !== keepImageId);
    for (const img of toDelete) {
      await deleteImage(img.id);
    }
  };

  const handleDismissGroup = async (group: DuplicateGroup) => {
    for (let i = 0; i < group.images.length; i++) {
      for (let j = i + 1; j < group.images.length; j++) {
        await dismissPair(group.images[i].id, group.images[j].id);
      }
    }
  };

  const reclaimableBytes = duplicateGroups.reduce((sum: number, g: DuplicateGroup) => {
    const sizes = g.images.map((img: Image) => img.file_size || 0);
    const maxSize = Math.max(...sizes);
    return sum + sizes.reduce((s: number, sz: number) => s + sz, 0) - maxSize;
  }, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Summary header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-gray-900">{duplicateGroups.length}</div>
              <div className="text-xs text-gray-500">Duplicate Groups</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {duplicateGroups.reduce((sum, g) => sum + g.images.length, 0)}
              </div>
              <div className="text-xs text-gray-500">Total Files</div>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatSize(reclaimableBytes)}</div>
              <div className="text-xs text-gray-500">Reclaimable</div>
            </div>
          </div>
          <button
            onClick={() => void handleScan()}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {scanning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Scan for Duplicates
              </>
            )}
          </button>
        </div>

        {/* Progress bar */}
        {scanning && scanProgress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between text-sm text-blue-700 mb-2">
              <span>
                {scanProgress.phase === 'hashing'
                  ? 'Computing image hashes...'
                  : 'Comparing images...'}
              </span>
              <span>
                {scanProgress.total > 0 ? `${scanProgress.current}/${scanProgress.total}` : ''}
              </span>
            </div>
            {scanProgress.total > 0 && (
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
            {scanProgress.currentFile && (
              <div className="text-xs text-blue-500 mt-1 truncate">{scanProgress.currentFile}</div>
            )}
          </div>
        )}

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

        {/* Initial state */}
        {!hasScanned && !scanning && duplicateGroups.length === 0 && (
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
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Find duplicate images</h3>
            <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">
              Find exact and visual duplicates.
            </p>
            <button
              onClick={() => void handleScan()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Scan for Duplicates
            </button>
          </div>
        )}

        {/* Empty state after scan */}
        {hasScanned && !scanning && duplicateGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No duplicates found</h3>
            <p className="text-sm text-gray-500">Your library is clean!</p>
          </div>
        )}

        {/* Duplicate group cards */}
        <div className="space-y-4">
          {duplicateGroups.map((group) => (
            <DuplicateGroupCard
              key={group.groupId}
              group={group}
              onKeep={(group, keepId) => void handleKeep(group, keepId)}
              onDismiss={(group) => void handleDismissGroup(group)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
