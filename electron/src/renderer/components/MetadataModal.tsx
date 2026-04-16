import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Image, SearchResult } from 'shared';
import { MetadataEditor } from './MetadataEditor';
import { SimilarityGrid } from './SimilarityGrid';

interface MetadataModalProps {
  image: Image;
  onClose: () => void;
  onNavigate: (image: Image) => void;
}

export function MetadataModal({ image, onClose, onNavigate }: MetadataModalProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [similarImages, setSimilarImages] = useState<SearchResult[]>([]);
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

    void window.sortieAPI.findSimilarImages(image.id, 20).then((results: SearchResult[]) => {
      if (cancelled) return;
      cache.current.set(image.id, results);
      // Cap cache size
      if (cache.current.size > 50) {
        const first = cache.current.keys().next().value;
        if (first !== undefined) cache.current.delete(first);
      }
      setSimilarImages(results);
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
        case 'ArrowLeft':
          e.preventDefault();
          if (leftImages.length > 0) onNavigate(leftImages[0]);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (rightImages.length > 0) onNavigate(rightImages[0]);
          break;
        case 'i':
          setShowMetadata((prev) => !prev);
          break;
      }
    },
    [onClose, onNavigate, leftImages, rightImages],
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
        <span className="text-white/80 text-sm truncate max-w-md">{image.file_name}</span>
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="absolute inset-0 top-14 flex">
        {/* Left sidebar — similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <SimilarityGrid images={leftImages} onImageClick={onNavigate} columns={2} />
          </div>
        </div>

        {/* Center image */}
        <div className="flex-1 flex items-center justify-center p-4 min-w-0">
          <img
            src={`sortie-file://${image.file_path}`}
            alt={image.file_name}
            className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            draggable={false}
          />
        </div>

        {/* Right sidebar — similar images */}
        <div
          className="w-[200px] flex-shrink-0 overflow-y-auto p-2 flex items-center"
          style={{ scrollbarWidth: 'thin', overscrollBehavior: 'contain' }}
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
            style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          >
            <MetadataEditor image={image} onClose={() => setShowMetadata(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
