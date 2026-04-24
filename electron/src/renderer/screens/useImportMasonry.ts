import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { computeMasonryLayout, type LayoutResult } from '../components/masonry-layout';
import type { PinterestResult } from 'shared';

const GAP = 8;
const MIN_COL_WIDTH = 200;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;

interface UseImportMasonryArgs {
  gridRef: RefObject<HTMLDivElement>;
  visibleResults: PinterestResult[];
}

export function useImportMasonry({ gridRef, visibleResults }: UseImportMasonryArgs) {
  const [gridWidth, setGridWidth] = useState(0);
  const priorLayoutRef = useRef<LayoutResult | undefined>(undefined);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGridWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [gridRef]);

  const columns = useMemo(() => {
    if (gridWidth <= 0) return MIN_COLUMNS;
    const fit = Math.floor((gridWidth + GAP) / (MIN_COL_WIDTH + GAP));
    return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, fit));
  }, [gridWidth]);

  const layoutItems = useMemo(
    () => visibleResults.map((result) => ({ id: result.pinId, width: result.width, height: result.height })),
    [visibleResults],
  );

  const layout = useMemo(() => {
    const next = computeMasonryLayout(
      layoutItems,
      gridWidth,
      columns,
      GAP,
      0,
      priorLayoutRef.current,
    );
    priorLayoutRef.current = next;
    return next;
  }, [columns, gridWidth, layoutItems]);

  return {
    columns,
    layout,
  };
}
