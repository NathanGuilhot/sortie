export interface MasonryItem {
  id: number | string;
  width: number | null;
  height: number | null;
}

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Fixed-height vertical bands used to look up which items intersect the
// viewport without scanning every position.
export const VISIBILITY_BUCKET_HEIGHT = 1000;

export interface LayoutResult {
  positions: Position[];
  totalHeight: number;
  // State captured at the end of the layout pass so an append can resume
  // without recomputing positions for earlier images.
  columnHeights: number[];
  // Inputs the layout was computed against; used to decide whether a prior
  // result can be reused as a starting point for an append.
  containerWidth: number;
  columnCount: number;
  gap: number;
  offset: number;
  imageCount: number;
  // Inputs from the prefix this layout was computed from. Used to invalidate
  // a prior layout when items are replaced, reordered, or change dimensions.
  firstImageId: number | string | undefined;
  lastImageId: number | string | undefined;
  itemSnapshots: MasonryItem[];
  // buckets[i] lists the item indices whose rectangle intersects the i-th
  // vertical band of height VISIBILITY_BUCKET_HEIGHT starting at y=0.
  buckets: number[][];
}

export function computeMasonryLayout<T extends MasonryItem>(
  images: T[],
  containerWidth: number,
  columnCount: number,
  gap: number,
  offset: number = 0,
  prior?: LayoutResult,
): LayoutResult {
  if (containerWidth <= 0 || images.length === 0) {
    return {
      positions: [],
      totalHeight: 0,
      columnHeights: Array.from<number>({ length: Math.max(columnCount, 1) }).fill(0),
      containerWidth,
      columnCount,
      gap,
      offset,
      imageCount: images.length,
      firstImageId: undefined,
      lastImageId: undefined,
      itemSnapshots: [],
      buckets: [],
    };
  }

  const colWidth = (containerWidth - (columnCount - 1) * gap) / columnCount;

  // Decide whether we can resume from `prior` instead of recomputing from
  // scratch. Width/column/gap/offset must match exactly and `prior` must be a
  // prefix of `images` (fill-shortest-column is stable given identical
  // prefixes, so position i is unchanged when images[0..i] are unchanged).
  const canResume =
    !!prior &&
    prior.containerWidth === containerWidth &&
    prior.columnCount === columnCount &&
    prior.gap === gap &&
    prior.offset === offset &&
    prior.imageCount > 0 &&
    prior.imageCount <= images.length &&
    prior.positions.length === prior.imageCount &&
    prior.itemSnapshots.length === prior.imageCount &&
    prior.firstImageId === images[0]?.id &&
    prior.lastImageId === images[prior.imageCount - 1]?.id &&
    prior.itemSnapshots.every((item, index) => {
      const image = images[index];
      return item.id === image.id && item.width === image.width && item.height === image.height;
    });

  const columnHeights = canResume
    ? prior.columnHeights.slice()
    : Array.from<number>({ length: columnCount }).fill(0);
  const positions: Position[] = canResume ? prior.positions.slice() : [];
  const startIndex = canResume ? prior.imageCount : 0;

  for (let i = startIndex; i < images.length; i++) {
    const image = images[i];

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

  const totalHeight = Math.max(...columnHeights) + offset;
  const buckets = buildVisibilityBuckets(positions, totalHeight);

  return {
    positions,
    totalHeight,
    columnHeights,
    containerWidth,
    columnCount,
    gap,
    offset,
    imageCount: images.length,
    firstImageId: images[0]?.id,
    lastImageId: images[images.length - 1]?.id,
    itemSnapshots: images.map(({ id, width, height }) => ({ id, width, height })),
    buckets,
  };
}

function buildVisibilityBuckets(positions: Position[], totalHeight: number): number[][] {
  const bucketCount = Math.max(1, Math.ceil(totalHeight / VISIBILITY_BUCKET_HEIGHT));
  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const first = Math.max(0, Math.floor(pos.y / VISIBILITY_BUCKET_HEIGHT));
    const last = Math.min(
      bucketCount - 1,
      Math.floor((pos.y + pos.height) / VISIBILITY_BUCKET_HEIGHT),
    );
    for (let b = first; b <= last; b++) {
      buckets[b].push(i);
    }
  }
  return buckets;
}

export function getVisibleIndices(
  layout: LayoutResult,
  viewTop: number,
  viewBottom: number,
): number[] {
  if (layout.buckets.length === 0) return [];
  const first = Math.max(0, Math.floor(viewTop / VISIBILITY_BUCKET_HEIGHT));
  const last = Math.min(
    layout.buckets.length - 1,
    Math.floor(viewBottom / VISIBILITY_BUCKET_HEIGHT),
  );

  // Single bucket: return its members filtered to the exact window.
  if (first === last) {
    const out: number[] = [];
    const bucket = layout.buckets[first];
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      const pos = layout.positions[i];
      if (pos.y + pos.height > viewTop && pos.y < viewBottom) out.push(i);
    }
    return out;
  }

  // Multiple buckets: union members, then filter. An item spanning a bucket
  // boundary appears in both, so dedupe via a Set.
  const seen = new Set<number>();
  const out: number[] = [];
  for (let b = first; b <= last; b++) {
    const bucket = layout.buckets[b];
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k];
      if (seen.has(i)) continue;
      seen.add(i);
      const pos = layout.positions[i];
      if (pos.y + pos.height > viewTop && pos.y < viewBottom) out.push(i);
    }
  }
  return out;
}
