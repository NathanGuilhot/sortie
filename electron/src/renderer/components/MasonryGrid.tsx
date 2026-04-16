import { useEffect, useState, useRef, useMemo, RefObject } from 'react';
import { useImageStore } from '../stores/imageStore';
import { computeMasonryLayout, MasonryImage } from './masonry-utils';

const OVERSCAN = 500;
const GAP = 8;

const MIN_COL_WIDTH = 220;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;

interface MasonryGridProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function MasonryGrid({ scrollContainerRef }: MasonryGridProps) {
  const { images, loading, error, fetchImages, hasMore, setSelectedImage } = useImageStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef(0);
  const loadingMore = useRef(false);

  useEffect(() => {
    void fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track scroll position and viewport height
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    setViewportHeight(scrollEl.clientHeight);

    const handleScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setScrollTop(scrollEl.scrollTop);
      });
    };

    const handleResize = () => {
      setViewportHeight(scrollEl.clientHeight);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
      resizeObs.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [scrollContainerRef]);

  // Compute responsive column count
  const padding = 16; // p-4 = 16px
  const layoutWidth = containerWidth; // contentRect already excludes CSS padding
  const columns = useMemo(() => {
    if (layoutWidth <= 0) return MIN_COLUMNS;
    const fit = Math.floor((layoutWidth + GAP) / (MIN_COL_WIDTH + GAP));
    return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, fit));
  }, [layoutWidth]);

  const layout = useMemo(
    () => computeMasonryLayout(images, layoutWidth, columns, GAP, padding),
    [images, layoutWidth, columns],
  );

  const columnWidth = layoutWidth > 0 ? (layoutWidth - (columns - 1) * GAP) / columns : 0;

  // Determine visible items (virtualization)
  const visibleIndices = useMemo(() => {
    const indices: number[] = [];
    const top = scrollTop - OVERSCAN;
    const bottom = scrollTop + viewportHeight + OVERSCAN;
    for (let i = 0; i < layout.positions.length; i++) {
      const pos = layout.positions[i];
      if (pos.y + pos.height > top && pos.y < bottom) {
        indices.push(i);
      }
    }
    return indices;
  }, [layout.positions, scrollTop, viewportHeight]);

  // Infinite scroll: load more when near bottom
  useEffect(() => {
    if (!hasMore || loadingMore.current) return;
    const bottomEdge = scrollTop + viewportHeight + OVERSCAN;
    if (layout.totalHeight > 0 && bottomEdge >= layout.totalHeight) {
      loadingMore.current = true;
      void fetchImages(100, images.length, true).finally(() => {
        loadingMore.current = false;
      });
    }
  }, [scrollTop, viewportHeight, layout.totalHeight, hasMore, images.length, fetchImages]);

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
            onClick={() => setSelectedImage(images[i])}
          />
        ))}
    </div>
  );
}
