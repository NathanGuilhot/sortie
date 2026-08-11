import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CropHandle, Image, ImageEditTransform, NormalizedCrop } from 'shared';
import {
  adjustCrop,
  flipCropHorizontally,
  isNoopImageEdit,
  rotateCropClockwise,
  rotateOrientationClockwise,
} from 'shared';
import { buildSortieEditPreviewUrl } from './sortieImageUrl';
import { FlipHorizontalIcon } from './icons';

const FULL_CROP: NormalizedCrop = { left: 0, top: 0, right: 1, bottom: 1 };
const EDIT_PREVIEW_SIZE = 1600;
type DragKind = CropHandle;

export function ImageCropEditor({
  image,
  onCancel,
  onApplied,
}: {
  image: Image;
  onCancel: () => void;
  onApplied: (image: Image) => void;
}) {
  const [crop, setCrop] = useState(FULL_CROP);
  const [turns, setTurns] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [displayedPreview, setDisplayedPreview] = useState<{ url: string; ratio: number } | null>(
    null,
  );
  const [surfaceSize, setSurfaceSize] = useState<{ width: number; height: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: DragKind; x: number; y: number; crop: NormalizedCrop } | null>(
    null,
  );
  const transform: ImageEditTransform = { crop, clockwiseTurns: turns, flipHorizontal: flipped };
  const sourceRatio = (image.width ?? 4) / (image.height ?? 3);
  const oddTurn = turns % 2 === 1;
  const fallbackRatio = oddTurn ? 1 / sourceRatio : sourceRatio;
  const previewUrl = buildSortieEditPreviewUrl(
    image.file_path,
    turns,
    flipped,
    EDIT_PREVIEW_SIZE,
    previewAttempt === 0
      ? image.file_mtime_ms
      : `${image.file_mtime_ms ?? ''}-retry-${previewAttempt}`,
  );
  const previewPending = displayedPreview?.url !== previewUrl;
  const previewLoading = previewPending && previewError === null;
  const displayRatio = displayedPreview?.ratio ?? fallbackRatio;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      if (rect.width / rect.height > displayRatio) {
        setSurfaceSize({ width: rect.height * displayRatio, height: rect.height });
      } else {
        setSurfaceSize({ width: rect.width, height: rect.width / displayRatio });
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [displayRatio]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !confirming) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirming, onCancel, saving]);

  const apply = async () => {
    if (isNoopImageEdit(transform)) return onCancel();
    const preference = await window.sortieAPI.settings.get('imageEditing.showWarning');
    if (preference !== 'false' && !confirming) return setConfirming(true);
    setSaving(true);
    setError(null);
    try {
      if (!showWarning) await window.sortieAPI.settings.set('imageEditing.showWarning', 'false');
      const updated = await window.sortieAPI.applyImageEdit(image.id, transform);
      if (!updated) throw new Error('Image disappeared after editing');
      onApplied(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
      setConfirming(false);
    }
  };

  const startDrag = (kind: DragKind, event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, x: event.clientX, y: event.clientY, crop };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const surface = surfaceRef.current;
    if (!drag || !surface) return;
    const rect = surface.getBoundingClientRect();
    setCrop(
      adjustCrop(
        drag.crop,
        drag.kind,
        (event.clientX - drag.x) / rect.width,
        (event.clientY - drag.y) / rect.height,
      ),
    );
  };
  const rotate = () => {
    setPreviewError(null);
    setCrop((value) => rotateCropClockwise(value));
    setTurns((value) => rotateOrientationClockwise(value, flipped));
  };
  const flip = () => {
    setPreviewError(null);
    setCrop((value) => flipCropHorizontally(value));
    setFlipped((value) => !value);
  };

  return (
    <div className="absolute inset-0 bg-black/90 z-20" onClick={(event) => event.stopPropagation()}>
      <div className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between">
        <span className="text-sm text-white/80">Edit image</span>
        <div className="flex items-center gap-2">
          <button disabled={saving} onClick={onCancel} className="px-3 py-2 text-sm text-white/70">
            Cancel
          </button>
          <button
            disabled={saving || previewPending}
            onClick={() => void apply()}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="absolute inset-0 top-14 bottom-20 flex items-center justify-center p-4"
      >
        <div
          ref={surfaceRef}
          onPointerMove={moveDrag}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          className="relative flex-none overflow-hidden bg-black"
          style={surfaceSize ?? undefined}
        >
          {displayedPreview && (
            <img
              src={displayedPreview.url}
              alt={image.file_name}
              draggable={false}
              className={`absolute inset-0 h-full w-full object-contain select-none pointer-events-none transition-opacity ${previewPending ? 'opacity-50' : 'opacity-100'}`}
            />
          )}
          {previewLoading && (
            <img
              data-testid="pending-image-preview"
              src={previewUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setPreviewError(null);
                  setDisplayedPreview({ url: previewUrl, ratio: naturalWidth / naturalHeight });
                }
              }}
              onError={() => setPreviewError('Could not render the image preview.')}
              className="hidden"
            />
          )}
          {previewLoading && (
            <div
              role="status"
              aria-label="Loading image preview"
              className="absolute inset-0 flex items-center justify-center bg-black/15"
            >
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}
          {previewPending && previewError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
              <p className="text-sm">{previewError}</p>
              <button
                aria-label="Retry preview"
                onClick={() => {
                  setPreviewError(null);
                  setPreviewAttempt((value) => value + 1);
                }}
                className="rounded-lg bg-white/15 px-3 py-2 text-sm hover:bg-white/20"
              >
                Retry
              </button>
            </div>
          )}
          {!previewPending && <CropFrame crop={crop} onStart={startDrag} />}
        </div>
      </div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 rounded-full bg-black/50 p-1.5">
        <button
          title="Rotate 90° clockwise"
          aria-label="Rotate 90° clockwise"
          disabled={saving || previewPending}
          onClick={rotate}
          className="w-10 h-10 rounded-full text-white/70 hover:bg-white/10 disabled:opacity-40 text-2xl"
        >
          ↻
        </button>
        <button
          title="Flip horizontally"
          aria-label="Flip horizontally"
          disabled={saving || previewPending}
          onClick={flip}
          className={`w-10 h-10 rounded-full text-white/70 hover:bg-white/10 disabled:opacity-40 ${flipped ? 'bg-white/20' : ''}`}
        >
          <FlipHorizontalIcon className="w-5 h-5 mx-auto" />
        </button>
      </div>
      {confirming && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-xl bg-white p-6 text-gray-900 shadow-2xl">
            <h2 className="font-semibold">Overwrite original image?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This edit permanently replaces the original file and cannot be undone.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showWarning}
                onChange={(e) => setShowWarning(e.target.checked)}
              />
              Show warning when editing an image
            </label>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={() => void apply()}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
              >
                Overwrite image
              </button>
            </div>
          </div>
        </div>
      )}
      {error && !confirming && (
        <p className="absolute bottom-3 left-6 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

function CropFrame({
  crop,
  onStart,
}: {
  crop: NormalizedCrop;
  onStart: (kind: DragKind, event: PointerEvent<HTMLElement>) => void;
}) {
  const handles: Array<[DragKind, string]> = [
    ['nw', '-left-2 -top-2 w-4 h-4 cursor-nwse-resize'],
    ['n', 'left-1/2 -translate-x-1/2 -top-1.5 w-8 h-3 cursor-ns-resize'],
    ['ne', '-right-2 -top-2 w-4 h-4 cursor-nesw-resize'],
    ['e', '-right-1.5 top-1/2 -translate-y-1/2 w-3 h-8 cursor-ew-resize'],
    ['se', '-right-2 -bottom-2 w-4 h-4 cursor-nwse-resize'],
    ['s', 'left-1/2 -translate-x-1/2 -bottom-1.5 w-8 h-3 cursor-ns-resize'],
    ['sw', '-left-2 -bottom-2 w-4 h-4 cursor-nesw-resize'],
    ['w', '-left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 cursor-ew-resize'],
  ];
  return (
    <div
      onPointerDown={(e) => onStart('move', e)}
      className="absolute border-2 border-white cursor-move touch-none shadow-[0_0_0_9999px_rgba(0,0,0,.5)]"
      style={{
        left: `${crop.left * 100}%`,
        top: `${crop.top * 100}%`,
        width: `${(crop.right - crop.left) * 100}%`,
        height: `${(crop.bottom - crop.top) * 100}%`,
      }}
    >
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="border-r border-b border-white/30" />
        ))}
      </div>
      {handles.map(([kind, className]) => (
        <button
          key={kind}
          aria-label={`Resize crop ${kind}`}
          onPointerDown={(e) => onStart(kind, e)}
          className={`absolute rounded-full bg-white shadow ${className}`}
        />
      ))}
    </div>
  );
}
