import { useEffect, useRef } from 'react';
import { SearchBar } from '../components/SearchBar';
import { RefreshControl } from '../components/RefreshControl';
import { MasonryGrid } from '../components/MasonryGrid';
import { MetadataModal } from '../components/MetadataModal';
import { AddFromWebPill } from '../components/AddFromWebPill';
import { SearchHint, WebImportHint } from '../components/OnboardingHints';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { useGalleryQuery } from '../search/useGalleryQuery';
import { focusSearch, scrollGalleryToTop } from '../search/galleryCommands';

export function GalleryScreen() {
  const selectedImage = useImageStore((s) => s.selectedImage);
  const viewerBackStack = useImageStore((s) => s.viewerBackStack);
  const viewerForwardStack = useImageStore((s) => s.viewerForwardStack);
  const closeImageViewer = useImageStore((s) => s.closeImageViewer);
  const navigateImageViewer = useImageStore((s) => s.navigateImageViewer);
  const goBackImageViewer = useImageStore((s) => s.goBackImageViewer);
  const goForwardImageViewer = useImageStore((s) => s.goForwardImageViewer);
  const clearFilters = useUIStore((s) => s.clearFilters);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useGalleryQuery(scrollContainerRef);

  useEffect(() => {
    return () => clearFilters();
  }, [clearFilters]);

  useEffect(() => focusSearch.register(() => searchInputRef.current?.focus()), []);
  useEffect(
    () =>
      scrollGalleryToTop.register(() =>
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }),
      ),
    [],
  );

  return (
    <>
      <SearchBar inputRef={searchInputRef} />
      <RefreshControl scrollContainerRef={scrollContainerRef} />
      <main className="flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-16 pb-10">
          <MasonryGrid scrollContainerRef={scrollContainerRef} />
        </div>
        {selectedImage && (
          <MetadataModal
            image={selectedImage}
            onClose={closeImageViewer}
            onNavigate={navigateImageViewer}
            onBack={goBackImageViewer}
            onForward={goForwardImageViewer}
            canGoBack={viewerBackStack.length > 0}
            canGoForward={viewerForwardStack.length > 0}
          />
        )}
        <AddFromWebPill />
        <SearchHint />
        <WebImportHint />
      </main>
    </>
  );
}
