import { Image } from 'shared';

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Position[];
  totalHeight: number;
}

export function computeMasonryLayout(
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
  const columnHeights = Array.from<number>({ length: columnCount }).fill(0);
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
