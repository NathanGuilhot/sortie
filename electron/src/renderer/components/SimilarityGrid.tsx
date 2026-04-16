import { useEffect, useState, useRef, useMemo } from 'react';
import { Image } from 'shared';
import { computeMasonryLayout, MasonryImage } from './masonry-utils';

const GAP = 6;

interface SimilarityGridProps {
  images: Image[];
  onImageClick: (image: Image) => void;
  columns?: number;
}

export function SimilarityGrid({ images, onImageClick, columns = 2 }: SimilarityGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => computeMasonryLayout(images, containerWidth, columns, GAP),
    [images, containerWidth, columns],
  );

  const columnWidth = containerWidth > 0 ? (containerWidth - (columns - 1) * GAP) / columns : 0;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', minHeight: layout.totalHeight || undefined }}
    >
      {layout.positions.map((pos, i) => (
        <MasonryImage
          key={images[i].id}
          image={images[i]}
          position={pos}
          columnWidth={columnWidth}
          onClick={() => onImageClick(images[i])}
        />
      ))}
    </div>
  );
}
