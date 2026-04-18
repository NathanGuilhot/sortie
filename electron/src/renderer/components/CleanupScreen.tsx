import { useState } from 'react';
import { useCleanupStore } from '../stores/cleanupStore';
import { CopyText } from './CopyText';
import { DuplicateGroup, Image } from 'shared';
import {
  ScreenShell,
  StatHeader,
  EmptyState,
  ProgressPanel,
  PrimaryButton,
  CancelButton,
} from './screen';

const SearchIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const DuplicateIcon = (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const CheckIcon = (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

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
                ? 'bg-coral/30 text-ink'
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
          className="w-full px-2 py-1.5 text-xs text-ink border border-ink/20 rounded hover:bg-lavender/30 transition-colors cursor-pointer"
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
    scanning,
    scanProgress,
    scanForDuplicates,
    cancelScan,
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
    const failures: { fileName: string; message: string }[] = [];
    for (const img of toDelete) {
      try {
        await deleteImage(img.id);
      } catch (err: unknown) {
        failures.push({
          fileName: img.file_name,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (failures.length === 0) {
      setError(null);
      return;
    }
    const first = failures[0].message;
    if (failures.length === 1) {
      setError(`Couldn't delete ${failures[0].fileName}: ${first}`);
    } else {
      setError(
        `Couldn't delete ${failures.length} of ${toDelete.length} files. First failure: ${first}`,
      );
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
    <ScreenShell>
      <StatHeader
        stats={[
          { value: duplicateGroups.length, label: 'Duplicate Groups' },
          {
            value: duplicateGroups.reduce((sum, g) => sum + g.images.length, 0),
            label: 'Total Files',
          },
          { value: formatSize(reclaimableBytes), label: 'Reclaimable' },
        ]}
        action={
          scanning ? (
            <CancelButton onClick={() => void cancelScan()}>Cancel</CancelButton>
          ) : (
            <PrimaryButton icon={SearchIcon} onClick={() => void handleScan()}>
              Scan for Duplicates
            </PrimaryButton>
          )
        }
      />

      {scanning && scanProgress && (
        <ProgressPanel
          label={
            scanProgress.phase === 'hashing'
              ? 'Computing image hashes...'
              : 'Comparing images...'
          }
          current={scanProgress.current}
          total={scanProgress.total}
          currentFile={scanProgress.currentFile}
        />
      )}

      {!hasScanned && !scanning && duplicateGroups.length === 0 && (
        <EmptyState
          icon={DuplicateIcon}
          title="Find duplicate images"
          description="Find exact and visual duplicates."
          action={
            <PrimaryButton icon={SearchIcon} size="lg" onClick={() => void handleScan()}>
              Scan for Duplicates
            </PrimaryButton>
          }
        />
      )}

      {hasScanned && !scanning && duplicateGroups.length === 0 && (
        <EmptyState
          icon={CheckIcon}
          iconTone="success"
          title="No duplicates found"
          description="Your library is clean!"
        />
      )}

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
    </ScreenShell>
  );
}
