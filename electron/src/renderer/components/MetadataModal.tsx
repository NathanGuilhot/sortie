import { useState, useEffect, useCallback } from 'react';
import { Image } from 'shared';
import { MetadataEditor } from './MetadataEditor';

interface MetadataModalProps {
  image: Image;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function MetadataModal({ image, onClose, onPrev, onNext, hasPrev, hasNext }: MetadataModalProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset image loaded state when image changes
  useEffect(() => {
    setImageLoaded(false);
  }, [image.id]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip shortcuts when typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        onPrev();
        break;
      case 'ArrowRight':
        e.preventDefault();
        onNext();
        break;
      case 'i':
        setShowMetadata(prev => !prev);
        break;
    }
  }, [onClose, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/90"
        onClick={onClose}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-10">
        <span className="text-white/80 text-sm truncate max-w-md">
          {image.file_name}
        </span>
        <div className="flex items-center gap-2">
          {/* Info toggle */}
          <button
            onClick={() => setShowMetadata(prev => !prev)}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${
              showMetadata ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title="Toggle details (i)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="absolute inset-0 top-14 flex items-center justify-center p-8">
        <img
          src={`sortie-file://${image.file_path}`}
          alt={image.file_name}
          className={`max-w-full max-h-full object-contain transition-opacity duration-200 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={showMetadata ? { maxWidth: 'calc(100% - 24rem)' } : undefined}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />
      </div>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
          style={showMetadata ? { right: '25rem' } : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Metadata panel */}
      {showMetadata && (
        <div
          className="absolute top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-sm shadow-2xl z-20 overflow-y-auto animate-slide-in-right"
          style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}
          onClick={(e) => e.stopPropagation()}
        >
          <MetadataEditor image={image} onClose={() => setShowMetadata(false)} />
        </div>
      )}
    </div>
  );
}
