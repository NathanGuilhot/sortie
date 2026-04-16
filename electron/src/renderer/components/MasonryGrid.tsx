import { useEffect, useState, useRef, useMemo, memo, RefObject } from 'react';
import { useImageStore } from '../stores/imageStore';
import { Image } from 'shared';

const OVERSCAN = 500;
const GAP = 8;

interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutResult {
  positions: Position[];
  totalHeight: number;
}

function computeMasonryLayout(
  images: Image[],
  containerWidth: number,
  columnCount: number,
  gap: number,
  offset: number = 0,
): LayoutResult {
  if (containerWidth <= 0 || images.length === 0) {
    return { positions: [], totalHeight: 0 };
  }

  const colWidth = (containerWidth - (columnCount - 1) * gap) / columnCount;
  const columnHeights = new Array(columnCount).fill(0);
  const positions: Position[] = [];

  for (const image of images) {
    // Pick the shortest column
    let minCol = 0;
    for (let c = 1; c < columnCount; c++) {
      if (columnHeights[c] < columnHeights[minCol]) minCol = c;
    }

    const aspect = image.width && image.height ? image.height / image.width : 0.75;
    const renderedHeight = colWidth * aspect;

    positions.push({
      x: minCol * (colWidth + gap) + offset,
      y: columnHeights[minCol] + offset,
      width: colWidth,
      height: renderedHeight,
    });

    columnHeights[minCol] += renderedHeight + gap;
  }

  return {
    positions,
    totalHeight: Math.max(...columnHeights) + offset,
  };
}

// --- MasonryImage ---

const MasonryImage = memo(function MasonryImage({
  image,
  position,
  columnWidth,
  onClick,
}: {
  image: Image;
  position: Position;
  columnWidth: number;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const thumbWidth = Math.ceil(columnWidth * (window.devicePixelRatio || 1));
  const src = `sortie-thumb://${image.file_path}?w=${thumbWidth}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: position.y,
        left: position.x,
        width: position.width,
        height: position.height,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        backgroundColor: '#f3f4f6',
      }}
      onClick={onClick}
    >
      <img
        src={src}
        alt={image.file_name}
        title={image.description || image.file_name}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {image.embedded === false && loaded && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
          title="No embedding — won't appear in search results"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}
    </div>
  );
});

// --- MasonryGrid ---

interface MasonryGridProps {
  columns?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function MasonryGrid({ columns = 3, scrollContainerRef }: MasonryGridProps) {
  const { images, loading, error, fetchImages, hasMore, setSelectedImage } = useImageStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef(0);
  const loadingMore = useRef(false);

  // Fetch initial images
  useEffect(() => {
    fetchImages();
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

  // Compute layout
  const padding = 16; // p-4 = 16px
  const layoutWidth = containerWidth; // contentRect already excludes CSS padding
  const layout = useMemo(
    () => computeMasonryLayout(images, layoutWidth, columns, GAP, padding),
    [images, layoutWidth, columns],
  );

  const columnWidth = layoutWidth > 0
    ? (layoutWidth - (columns - 1) * GAP) / columns
    : 0;

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
      fetchImages(100, images.length, true).finally(() => {
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
      {content ?? visibleIndices.map((i) => (
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
