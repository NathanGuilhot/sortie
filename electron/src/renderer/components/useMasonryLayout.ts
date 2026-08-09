import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  computeMasonryLayout,
  getVisibleIndices,
  type LayoutResult,
  type MasonryItem,
} from './masonry-layout';

export const DEFAULT_GAP = 8;
export const DEFAULT_PADDING = 16;
export const DEFAULT_MIN_COL_WIDTH = 220;
export const DEFAULT_MIN_COLUMNS = 2;
export const DEFAULT_MAX_COLUMNS = 5;
export const DEFAULT_OVERSCAN = 500;

interface UseMasonryLayoutOptions<T extends MasonryItem> {
  items: T[];
  scrollContainerRef: RefObject<HTMLElement | null>;
  gap?: number;
  padding?: number;
  minColWidth?: number;
  minColumns?: number;
  maxColumns?: number;
  overscan?: number;
  // Reuse the prior layout for append-only updates. Turn off when items can
  // be reordered or removed from the middle: the layout skips recomputing
  // existing positions when resuming, which would leave stale coordinates.
  resumeOnAppend?: boolean;
}

interface UseMasonryLayoutResult {
  containerRef: RefObject<HTMLDivElement>;
  containerWidth: number;
  columns: number;
  columnWidth: number;
  layout: LayoutResult;
  visibleIndices: number[];
  scrollTop: number;
  viewportHeight: number;
  padding: number;
  gap: number;
}

export function useMasonryLayout<T extends MasonryItem>({
  items,
  scrollContainerRef,
  gap = DEFAULT_GAP,
  padding = DEFAULT_PADDING,
  minColWidth = DEFAULT_MIN_COL_WIDTH,
  minColumns = DEFAULT_MIN_COLUMNS,
  maxColumns = DEFAULT_MAX_COLUMNS,
  overscan = DEFAULT_OVERSCAN,
  resumeOnAppend = false,
}: UseMasonryLayoutOptions<T>): UseMasonryLayoutResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rafRef = useRef(0);

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

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    setViewportHeight(scrollEl.clientHeight);
    const handleScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setScrollTop(scrollEl.scrollTop));
    };
    const handleResize = () => setViewportHeight(scrollEl.clientHeight);
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(scrollEl);
    return () => {
      scrollEl.removeEventListener('scroll', handleScroll);
      resizeObs.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [scrollContainerRef]);

  const columns = useMemo(() => {
    if (containerWidth <= 0) return minColumns;
    const fit = Math.floor((containerWidth + gap) / (minColWidth + gap));
    return Math.max(minColumns, Math.min(maxColumns, fit));
  }, [containerWidth, gap, minColWidth, minColumns, maxColumns]);

  // Cache the last layout so append-only updates can resume from the prior
  // positions instead of recomputing every tile. Read/write during render is
  // intentional: the memo only recomputes when inputs change, so the ref is
  // effectively acting as a single-slot memoization cache.
  const priorLayoutRef = useRef<LayoutResult | undefined>(undefined);
  const layout = useMemo(() => {
    const next = computeMasonryLayout(
      items,
      containerWidth,
      columns,
      gap,
      padding,
      // eslint-disable-next-line react-hooks/refs
      resumeOnAppend ? priorLayoutRef.current : undefined,
    );
    // eslint-disable-next-line react-hooks/refs
    priorLayoutRef.current = next;
    return next;
  }, [items, containerWidth, columns, gap, padding, resumeOnAppend]);

  const columnWidth = containerWidth > 0 ? (containerWidth - (columns - 1) * gap) / columns : 0;

  const visibleIndices = useMemo(() => {
    const top = scrollTop - overscan;
    const bottom = scrollTop + viewportHeight + overscan;
    return getVisibleIndices(layout, top, bottom);
  }, [layout, scrollTop, viewportHeight, overscan]);

  return {
    containerRef,
    containerWidth,
    columns,
    columnWidth,
    layout,
    visibleIndices,
    scrollTop,
    viewportHeight,
    padding,
    gap,
  };
}
