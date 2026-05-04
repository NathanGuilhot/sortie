import { useCallback, useEffect, useRef, RefObject } from 'react';
import { Image } from 'shared';
import { useImageStore } from '../stores/imageStore';
import { MasonryImage } from './masonry-utils';
import { useMasonryLayout, DEFAULT_OVERSCAN } from './useMasonryLayout';

interface MasonryGridProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function MasonryGrid({ scrollContainerRef }: MasonryGridProps) {
  const { images, loading, error, loadMore, hasMore, openImageViewer } = useImageStore();
  const loadingMore = useRef(false);

  const { containerRef, columnWidth, layout, visibleIndices, scrollTop, viewportHeight, padding } =
    useMasonryLayout({
      items: images,
      scrollContainerRef,
      resumeOnAppend: true,
    });

  const handleSelect = useCallback((image: Image) => openImageViewer(image), [openImageViewer]);

  useEffect(() => {
    if (!hasMore || loadingMore.current) return;
    const bottomEdge = scrollTop + viewportHeight + DEFAULT_OVERSCAN;
    if (layout.totalHeight > 0 && bottomEdge >= layout.totalHeight) {
      loadingMore.current = true;
      void loadMore().finally(() => {
        loadingMore.current = false;
      });
    }
  }, [scrollTop, viewportHeight, layout.totalHeight, hasMore, loadMore]);

  let content: React.ReactNode = null;
  if (loading && images.length === 0) {
    content = (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-200 rounded-lg animate-pulse"
            style={{ height: [200, 280, 240, 260, 220, 300, 180, 250, 270][i] }}
          />
        ))}
      </div>
    );
  } else if (error && images.length === 0) {
    content = (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error loading images: {error}</div>
      </div>
    );
  } else if (images.length === 0) {
    content = (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No images found. Add a folder to get started.</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="p-4"
      style={{
        position: 'relative',
        minHeight: content ? undefined : layout.totalHeight + padding,
      }}
    >
      {content ??
        visibleIndices.map((i) => (
          <MasonryImage
            key={images[i].id}
            image={images[i]}
            position={layout.positions[i]}
            columnWidth={columnWidth}
            onSelect={handleSelect}
          />
        ))}
    </div>
  );
}
