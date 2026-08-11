import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Image, SearchResult } from 'shared';
import { MetadataEditor } from './MetadataEditor';
import { CopyText } from './CopyText';
import { SimilarityGrid } from './SimilarityGrid';
import { OcrOverlay } from './OcrOverlay';
import { useImageStore } from '../stores/imageStore';
import { toast } from '../stores/toastStore';
import { ChevronLeftIcon, EditIcon, InfoIcon, XIcon } from './icons';
import { buildSortieFileUrl } from './sortieImageUrl';
import { ImageCropEditor } from './ImageCropEditor';

const SWIPE_THRESHOLD_PX = 60;
const SWIPE_VERTICAL_TOLERANCE_PX = 45;
const WHEEL_SWIPE_THRESHOLD_PX = 45;
const WHEEL_SWIPE_IDLE_RESET_MS = 160;

interface MetadataModalProps {
  image: Image;
  onClose: () => void;
  onNavigate: (image: Image) => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onSimilarImageClick?: (image: Image) => void;
  images?: Image[];
}

export function MetadataModal({
  image,
  onClose,
  onNavigate,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onSimilarImageClick,
  images: imagesProp,
}: MetadataModalProps) {
  const storeImages = useImageStore((s) => s.images);
  const images = imagesProp ?? storeImages;
  const [showMetadata, setShowMetadata] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editEligibility, setEditEligibility] = useState<{
    editable: boolean;
    reason: string | null;
  }>({ editable: false, reason: 'Checking whether this image can be edited…' });
  const replaceImage = useImageStore((s) => s.replaceImage);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [similarImages, setSimilarImages] = useState<SearchResult[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<number, SearchResult[]>());
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = useRef(false);
  const wheelSwipeConsumedRef = useRef(false);
  const wheelSwipeResetRef = useRef<number | null>(null);

  // Reset image loaded state when image changes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setImageLoaded(false);
    setEditing(false);
    void window.sortieAPI
      .getImageEditEligibility(image.id)
      .then(setEditEligibility)
      .catch(() =>
        setEditEligibility({
          editable: false,
          reason: 'Could not check whether this image is editable.',
        }),
      );
  }, [image.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch similar images
  useEffect(() => {
    const cached = cache.current.get(image.id);
    if (cached) {
      setSimilarImages(cached);
      return;
    }

    let cancelled = false;
    setSimilarImages([]);

    window.sortieAPI
      .findSimilarImages(image.id, 20)
      .then((results: SearchResult[]) => {
        if (cancelled) return;
        cache.current.set(image.id, results);
        // Cap cache size
        if (cache.current.size > 50) {
          const first = cache.current.keys().next().value;
          if (first !== undefined) cache.current.delete(first);
        }
        setSimilarImages(results);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load similar images: ${message}`);
      });

    return () => {
      cancelled = true;
    };
  }, [image.id]);

  // Split into left/right (interleaved so both sides have equally similar images)
  const leftImages = useMemo(() => similarImages.filter((_, i) => i % 2 === 0), [similarImages]);
  const rightImages = useMemo(() => similarImages.filter((_, i) => i % 2 !== 0), [similarImages]);
  const handleSimilarImageClick = onSimilarImageClick ?? onNavigate;
  const historyButtonClass =
    'w-9 h-9 flex items-center justify-center rounded-full transition-colors';
  const disabledHistoryButtonClass = 'text-white/25 cursor-default';
  const enabledHistoryButtonClass = 'text-white/60 hover:text-white hover:bg-white/10';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editing) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (
        target.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        tag === 'A'
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const idx = images.findIndex((img) => img.id === image.id);
          if (idx > 0) onNavigate(images[idx - 1]);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const idx = images.findIndex((img) => img.id === image.id);
          if (idx >= 0 && idx < images.length - 1) onNavigate(images[idx + 1]);
          break;
        }
        case 'Backspace':
          e.preventDefault();
          if (canGoBack) {
            onBack();
          }
          break;
        case 'Enter':
          if (canGoForward) {
            e.preventDefault();
            onForward();
          }
          break;
        case 'i':
          setShowMetadata((prev) => !prev);
          break;
      }
    },
    [editing, onClose, onNavigate, onBack, onForward, canGoBack, canGoForward, images, image.id],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const horizontalSwipe =
      Math.abs(deltaX) >= SWIPE_THRESHOLD_PX &&
      Math.abs(deltaY) <= SWIPE_VERTICAL_TOLERANCE_PX &&
      Math.abs(deltaX) > Math.abs(deltaY);
    if (!horizontalSwipe) return;

    didSwipeRef.current = true;
    if (deltaX > 0 && canGoBack) {
      onBack();
    } else if (deltaX < 0 && canGoForward) {
      onForward();
    }

    window.setTimeout(() => {
      didSwipeRef.current = false;
    }, 0);
  };

  const handleCloseClick = () => {
    if (didSwipeRef.current) return;
    onClose();
  };

  useEffect(() => {
    const element = modalRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) < WHEEL_SWIPE_THRESHOLD_PX) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      event.preventDefault();

      if (wheelSwipeResetRef.current) {
        window.clearTimeout(wheelSwipeResetRef.current);
      }
      wheelSwipeResetRef.current = window.setTimeout(() => {
        wheelSwipeConsumedRef.current = false;
      }, WHEEL_SWIPE_IDLE_RESET_MS);

      if (wheelSwipeConsumedRef.current) return;

      if (event.deltaX < 0 && canGoBack) {
        wheelSwipeConsumedRef.current = true;
        onBack();
      } else if (event.deltaX > 0 && canGoForward) {
        wheelSwipeConsumedRef.current = true;
        onForward();
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
      if (wheelSwipeResetRef.current) {
        window.clearTimeout(wheelSwipeResetRef.current);
        wheelSwipeResetRef.current = null;
      }
    };
  }, [canGoBack, canGoForward, onBack, onForward]);

  return (
    <div ref={modalRef} className="fixed inset-0 z-50 animate-fade-in">
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/90"
        onClick={handleCloseClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            className={`${historyButtonClass} ${
              canGoBack ? enabledHistoryButtonClass : disabledHistoryButtonClass
            }`}
            title="Back (Backspace)"
            aria-label="Back in image history"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <button
            onClick={onForward}
            disabled={!canGoForward}
            className={`${historyButtonClass} ${
              canGoForward ? enabledHistoryButtonClass : disabledHistoryButtonClass
            }`}
            title="Forward (Enter)"
            aria-label="Forward in image history"
          >
            <ChevronLeftIcon className="w-5 h-5 rotate-180" />
          </button>
          <CopyText value={image.file_name} className="text-white/80 text-sm truncate max-w-md">
            {image.file_name}
          </CopyText>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowMetadata(false);
              setEditing(true);
            }}
            disabled={!editEligibility.editable}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:text-white/20 disabled:cursor-not-allowed"
            title={
              editEligibility.editable
                ? 'Edit image'
                : (editEligibility.reason ?? 'Image cannot be edited')
            }
            aria-label="Edit image"
          >
            <EditIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowMetadata((prev) => !prev)}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              showMetadata
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Toggle details (i)"
          >
            <InfoIcon />
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="absolute inset-0 top-14 flex">
        {/* Left sidebar: similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <SimilarityGrid
              images={leftImages}
              onImageClick={handleSimilarImageClick}
              columns={2}
            />
          </div>
        </div>

        {/* Center image */}
        <div
          className="flex-1 flex items-center justify-center p-4 min-w-0 h-full overflow-hidden"
          onClick={handleCloseClick}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div
            className="relative inline-block max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              ref={imgRef}
              src={buildSortieFileUrl(image.file_path, image.file_mtime_ms)}
              alt={image.file_name}
              className={`block max-w-full object-contain transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ maxHeight: 'calc(100vh - 56px - 32px)' }}
              onLoad={() => setImageLoaded(true)}
              draggable={false}
            />
            <OcrOverlay imageId={image.id} imgRef={imgRef} imageLoaded={imageLoaded} />
          </div>
        </div>

        {/* Right sidebar: similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <SimilarityGrid
              images={rightImages}
              onImageClick={handleSimilarImageClick}
              columns={2}
            />
          </div>
        </div>

        {/* Metadata panel: overlaid on the right */}
        {showMetadata && (
          <div
            className="absolute top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-sm shadow-2xl overflow-y-auto animate-slide-in-right"
            style={{ overscrollBehavior: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MetadataEditor image={image} onClose={() => setShowMetadata(false)} />
          </div>
        )}
      </div>
      {editing && (
        <ImageCropEditor
          image={image}
          onCancel={() => setEditing(false)}
          onApplied={(updated) => {
            replaceImage(updated);
            setEditing(false);
            setImageLoaded(false);
          }}
        />
      )}
    </div>
  );
}
