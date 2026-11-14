import { useLayoutEffect, useRef, useState } from 'react';
import type { DuplicateGroup, Image } from 'shared';
import { useCleanupStore } from '../stores/cleanupStore';
import { useFolderStore } from '../stores/folderStore';
import { formatSize } from './folderScannerUtils';
import { buildSortieThumbUrl } from './sortieImageUrl';
import {
  ScreenShell,
  StatHeader,
  EmptyState,
  ProgressPanel,
  PrimaryButton,
  CancelButton,
} from './screen';
import { SearchIcon, ClipboardIcon, CheckIcon } from './icons';
import { MetadataModal } from './MetadataModal';

export function DuplicateGroupCard({
  group,
  busy,
  moving = false,
  onKeep,
  onDismiss,
}: {
  group: DuplicateGroup;
  busy: boolean;
  moving?: boolean;
  onKeep: (groupId: string, keepId: number) => void;
  onDismiss: (groupId: string) => void;
}) {
  const [keepId, setKeepId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<Image | null>(null);
  const isWritable = useFolderStore((s) => s.isWritable);
  const removalCount =
    keepId === null
      ? 0
      : group.images.filter((image) => image.id !== keepId && isWritable(image.file_path)).length;

  return (
    <section
      data-duplicate-group={group.groupId}
      className="bg-white rounded-lg border border-gray-200 p-5"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-medium text-ink">Choose an image to keep</h2>
        <span className="text-xs text-gray-500">{group.images.length} images</span>
      </div>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}
      >
        {group.images.map((image, index) => (
          <div key={image.id} className="min-w-0">
            <div
              className={`relative h-64 rounded-lg overflow-hidden bg-gray-100 border-2 ${keepId === image.id ? 'border-ink' : 'border-transparent'}`}
            >
              <button
                type="button"
                className="w-full h-full cursor-zoom-in"
                aria-label={`Inspect image ${index + 1}`}
                onClick={() => setPreview(image)}
              >
                <img
                  src={buildSortieThumbUrl(
                    image.file_path,
                    Math.ceil((300 * (window.devicePixelRatio || 1)) / 100) * 100,
                    image.file_mtime_ms,
                  )}
                  alt={image.file_name}
                  className="w-full h-full object-contain p-2"
                  loading="lazy"
                />
              </button>
              <input
                type="radio"
                name={`keep-${group.groupId}`}
                checked={keepId === image.id}
                aria-label={`Keep image ${index + 1}`}
                disabled={busy}
                onChange={() => {
                  setKeepId(image.id);
                  setConfirming(false);
                }}
                className="absolute top-2 left-2 w-5 h-5 accent-ink cursor-pointer"
              />
              {!isWritable(image.file_path) && (
                <span className="absolute bottom-2 left-2 text-xs bg-white/95 text-gray-600 px-2 py-1 rounded">
                  Read-only
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 text-center mt-2">
              {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}
              {formatSize(image.file_size ?? 0)}
            </p>
          </div>
        ))}
      </div>
      {confirming ? (
        <div className="border-t border-gray-200 mt-5 pt-4">
          <p className="text-sm text-ink mb-3">
            Keep the selected image and move{' '}
            {removalCount === 1 ? 'the other image' : `${removalCount} other images`} to Trash?
          </p>
          <div className="flex justify-end gap-2">
            <button
              className="text-sm px-4 py-2 rounded-lg hover:bg-gray-100"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <PrimaryButton
              disabled={busy || keepId === null}
              onClick={() => {
                if (keepId !== null) onKeep(group.groupId, keepId);
              }}
            >
              {moving ? 'Moving…' : `Move ${removalCount} to Trash`}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2 mt-5">
          <button
            className="text-sm text-ink px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            disabled={busy}
            onClick={() => onDismiss(group.groupId)}
          >
            Keep all
          </button>
          <PrimaryButton disabled={busy || removalCount === 0} onClick={() => setConfirming(true)}>
            Keep selected
          </PrimaryButton>
        </div>
      )}
      {preview && (
        <MetadataModal
          image={preview}
          onClose={() => setPreview(null)}
          onNavigate={setPreview}
          onBack={() => undefined}
          onForward={() => undefined}
          canGoBack={false}
          canGoForward={false}
          images={group.images}
        />
      )}
    </section>
  );
}

export function CleanupScreen() {
  const {
    duplicateGroups,
    scanning,
    working,
    activeGroupId,
    hasReviewed,
    scanProgress,
    hasScanned,
    notice,
    scanForDuplicates,
    cancelScan,
    dismissGroup,
    keepImage,
  } = useCleanupStore();
  const { isWritable } = useFolderStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<Array<{ id: string; top: number }>>([]);
  const capturePosition = () => {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    anchors.current = Array.from(container.querySelectorAll<HTMLElement>('[data-duplicate-group]'))
      .filter((element) => element.getBoundingClientRect().bottom > top)
      .map((element) => ({
        id: element.dataset.duplicateGroup!,
        top: element.getBoundingClientRect().top,
      }));
  };
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || !anchors.current.length) return;
    const elements = Array.from(container.querySelectorAll<HTMLElement>('[data-duplicate-group]'));
    for (const anchor of anchors.current) {
      const element = elements.find((item) => item.dataset.duplicateGroup === anchor.id);
      if (element) {
        container.scrollTop += element.getBoundingClientRect().top - anchor.top;
        break;
      }
    }
    anchors.current = [];
  }, [duplicateGroups]);
  const uniqueImages = new Map(
    duplicateGroups.flatMap((group) => group.images.map((image) => [image.id, image] as const)),
  );
  // Estimate a feasible cleanup once per image, retaining a keeper for each group.
  const removed = new Set<number>();
  const retained = new Set<number>();
  for (const group of duplicateGroups) {
    const remaining = group.images.filter((image) => !removed.has(image.id));
    const keeper =
      remaining.find((image) => retained.has(image.id) || !isWritable(image.file_path)) ??
      [...remaining].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];
    if (!keeper) continue;
    retained.add(keeper.id);
    for (const image of remaining)
      if (image.id !== keeper.id && !retained.has(image.id) && isWritable(image.file_path))
        removed.add(image.id);
  }
  const reclaimableBytes = [...removed].reduce(
    (sum, id) => sum + (uniqueImages.get(id)?.file_size ?? 0),
    0,
  );
  return (
    <ScreenShell
      scrollRef={scrollRef}
      onScroll={() => {
        if (anchors.current.length) capturePosition();
      }}
    >
      <StatHeader
        stats={[
          { value: duplicateGroups.length, label: 'Duplicate Groups' },
          { value: uniqueImages.size, label: 'Total Files' },
          { value: formatSize(reclaimableBytes), label: 'Reclaimable' },
        ]}
        action={
          scanning ? (
            <CancelButton onClick={() => void cancelScan()}>Cancel</CancelButton>
          ) : (
            <PrimaryButton
              icon={<SearchIcon />}
              disabled={working}
              onClick={() => void scanForDuplicates()}
            >
              Scan for Duplicates
            </PrimaryButton>
          )
        }
      />
      {scanning && (
        <ProgressPanel
          label="Scanning images…"
          current={scanProgress?.current}
          total={scanProgress?.total}
        />
      )}
      {notice && (
        <p role="status" className="text-sm text-amber-800 mb-5">
          {notice}
        </p>
      )}
      {!hasScanned && !scanning && duplicateGroups.length === 0 && (
        <EmptyState
          icon={<ClipboardIcon className="w-8 h-8" strokeWidth={1.5} />}
          title="Find duplicate images"
          description="Find exact and visual duplicates."
          action={
            <PrimaryButton
              icon={<SearchIcon />}
              size="lg"
              disabled={working}
              onClick={() => void scanForDuplicates()}
            >
              Scan for Duplicates
            </PrimaryButton>
          }
        />
      )}
      {hasScanned && !scanning && duplicateGroups.length === 0 && (
        <EmptyState
          icon={<CheckIcon className="w-8 h-8" />}
          iconTone={notice ? 'default' : 'success'}
          title={hasReviewed ? 'No remaining matches to review' : 'No duplicates found'}
          description={
            notice
              ? 'No matches remain in the images checked.'
              : hasReviewed
                ? undefined
                : 'Your library is clean!'
          }
        />
      )}
      <div className="space-y-4 pb-8">
        {duplicateGroups.map((group) => (
          <DuplicateGroupCard
            key={group.groupId}
            group={group}
            busy={scanning || working}
            moving={working && activeGroupId === group.groupId}
            onKeep={(groupId, keepId) => {
              capturePosition();
              void keepImage(groupId, keepId).finally(() => {
                if (useCleanupStore.getState().duplicateGroups === duplicateGroups)
                  anchors.current = [];
              });
            }}
            onDismiss={(groupId) => {
              capturePosition();
              void dismissGroup(groupId).finally(() => {
                if (useCleanupStore.getState().duplicateGroups === duplicateGroups)
                  anchors.current = [];
              });
            }}
          />
        ))}
      </div>
    </ScreenShell>
  );
}
