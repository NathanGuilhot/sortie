import { useEffect, useRef } from 'react';
import { SearchBar } from '../components/SearchBar';
import { RefreshControl } from '../components/RefreshControl';
import { MasonryGrid } from '../components/MasonryGrid';
import { MetadataModal } from '../components/MetadataModal';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';

export function GalleryScreen() {
  const selectedImage = useImageStore((s) => s.selectedImage);
  const setSelectedImage = useImageStore((s) => s.setSelectedImage);
  const clearFilters = useUIStore((s) => s.clearFilters);
  const focusSearchRequestedAt = useUIStore((s) => s.focusSearchRequestedAt);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => clearFilters();
  }, [clearFilters]);

  useEffect(() => {
    if (focusSearchRequestedAt > 0) searchInputRef.current?.focus();
  }, [focusSearchRequestedAt]);

  return (
    <>
      <SearchBar inputRef={searchInputRef} scrollContainerRef={scrollContainerRef} />
      <RefreshControl scrollContainerRef={scrollContainerRef} />
      <main className="flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-16 pb-10">
          <MasonryGrid scrollContainerRef={scrollContainerRef} />
        </div>
        {selectedImage && (
          <MetadataModal
            image={selectedImage}
            onClose={() => setSelectedImage(null)}
            onNavigate={(img) => setSelectedImage(img)}
          />
        )}
      </main>
    </>
  );
}
