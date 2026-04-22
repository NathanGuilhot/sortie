import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Image, SearchResult } from 'shared';
import { MetadataEditor } from './MetadataEditor';
import { CopyText } from './CopyText';
import { SimilarityGrid } from './SimilarityGrid';
import { OcrOverlay } from './OcrOverlay';
import { useImageStore } from '../stores/imageStore';
import { toast } from '../stores/toastStore';
import { InfoIcon, XIcon } from './icons';

interface MetadataModalProps {
  image: Image;
  onClose: () => void;
  onNavigate: (image: Image) => void;
  images?: Image[];
}

export function MetadataModal({
  image,
  onClose,
  onNavigate,
  images: imagesProp,
}: MetadataModalProps) {
  const storeImages = useImageStore((s) => s.images);
  const images = imagesProp ?? storeImages;
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [similarImages, setSimilarImages] = useState<SearchResult[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);
  const cache = useRef(new Map<number, SearchResult[]>());

  // Reset image loaded state when image changes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setImageLoaded(false);
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
        case 'i':
          setShowMetadata((prev) => !prev);
          break;
      }
    },
    [onClose, onNavigate, images, image.id],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-10">
        <CopyText value={image.file_name} className="text-white/80 text-sm truncate max-w-md">
          {image.file_name}
        </CopyText>
        <div className="flex items-center gap-2">
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
        {/* Left sidebar — similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <SimilarityGrid images={leftImages} onImageClick={onNavigate} columns={2} />
          </div>
        </div>

        {/* Center image */}
        <div
          className="flex-1 flex items-center justify-center p-4 min-w-0 h-full overflow-hidden"
          onClick={onClose}
        >
          <div
            className="relative inline-block max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              ref={imgRef}
              src={`sortie-file://${image.file_path}`}
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

        {/* Right sidebar — similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <SimilarityGrid images={rightImages} onImageClick={onNavigate} columns={2} />
          </div>
        </div>

        {/* Metadata panel — overlaid on the right */}
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
    </div>
  );
}
