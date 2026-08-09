import { describe, expect, it } from 'vitest';
import { computeMasonryLayout, getVisibleIndices } from '../masonry-layout';

describe('masonry layout', () => {
  it('lays out images in the shortest column and uses the default aspect ratio when dimensions are absent', () => {
    const layout = computeMasonryLayout(
      [
        { id: 1, width: 100, height: 100 },
        { id: 2, width: null, height: null },
        { id: 3, width: 100, height: 200 },
      ],
      210,
      2,
      10,
    );

    expect(layout.positions).toEqual([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 110, y: 0, width: 100, height: 75 },
      { x: 110, y: 85, width: 100, height: 200 },
    ]);
  });

  it('reuses an append-only prior layout but invalidates a replaced prefix', () => {
    const initial = computeMasonryLayout([{ id: 1, width: 100, height: 100 }], 100, 1, 0);
    const appended = computeMasonryLayout(
      [
        { id: 1, width: 100, height: 100 },
        { id: 2, width: 100, height: 100 },
      ],
      100,
      1,
      0,
      0,
      initial,
    );
    const replaced = computeMasonryLayout(
      [{ id: 9, width: 100, height: 100 }],
      100,
      1,
      0,
      0,
      initial,
    );

    expect(appended.positions[0]).toEqual(initial.positions[0]);
    expect(appended.positions[1].y).toBe(100);
    expect(replaced.firstImageId).toBe(9);
    expect(replaced.positions).toHaveLength(1);
  });

  it('returns each item once when a viewport crosses visibility buckets', () => {
    const layout = computeMasonryLayout(
      [
        { id: 1, width: 100, height: 1200 },
        { id: 2, width: 100, height: 100 },
      ],
      100,
      1,
      0,
    );

    expect(getVisibleIndices(layout, 950, 1250)).toEqual([0, 1]);
    expect(getVisibleIndices(layout, 1200, 1300)).toEqual([1]);
  });
});
