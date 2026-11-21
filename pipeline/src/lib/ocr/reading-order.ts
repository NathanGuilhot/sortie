/** Corners in pixels: top-left, top-right, bottom-right, bottom-left. */
export type Quad = number[][];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Sorts text lines top to bottom, then left to right, measured along the
 * text's own direction, so tilted text (a photo of a page) reads in order
 * without merging separate lines.
 */
export function sortInReadingOrder<T extends { box: Quad }>(lines: T[]): T[] {
  if (lines.length < 2) return [...lines];
  const angle = median(lines.map(({ box: [tl, tr] }) => Math.atan2(tr[1] - tl[1], tr[0] - tl[0])));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const lineHeight = median(
    lines.map(({ box: [tl, , , bl] }) => Math.hypot(bl[0] - tl[0], bl[1] - tl[1])),
  );

  const placed = lines.map((line) => {
    const cx = line.box.reduce((sum, [x]) => sum + x, 0) / 4;
    const cy = line.box.reduce((sum, [, y]) => sum + y, 0) / 4;
    // `along` runs with the text, `across` from one line to the next.
    return { line, along: cx * cos + cy * sin, across: -cx * sin + cy * cos };
  });
  placed.sort((a, b) => a.across - b.across);

  const rows: Array<typeof placed> = [];
  for (const item of placed) {
    const row = rows[rows.length - 1];
    if (row && item.across - row[0].across < lineHeight / 2) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.along - b.along).map(({ line }) => line));
}
