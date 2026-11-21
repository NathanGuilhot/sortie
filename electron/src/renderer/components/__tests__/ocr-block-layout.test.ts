import { describe, expect, it } from 'vitest';
import { layoutOcrBlock } from '../ocr-block-layout';

// Every character is 10px wide per 16px of font size.
const measure = (text: string, fontSize: number) => (text.length * 10 * fontSize) / 16;

describe('layoutOcrBlock', () => {
  it('measures a tilted line in pixels on a non-square image', () => {
    // A 45° line on a 2000×1000 image: 400px along each axis, 50px thick.
    const w = 2000;
    const h = 1000;
    const along = 400;
    const thick = 50 / Math.SQRT2;
    const tl: [number, number] = [0.1, 0.1];
    const tr: [number, number] = [tl[0] + along / w, tl[1] + along / h];
    const bl: [number, number] = [tl[0] - thick / w, tl[1] + thick / h];
    const br: [number, number] = [tr[0] - thick / w, tr[1] + thick / h];
    const layout = layoutOcrBlock(
      {
        text: 'hello',
        bbox: { x: 0, y: 0, width: 1, height: 1 },
        polygon: [tl, tr, br, bl],
        confidence: 1,
      },
      { width: w, height: h },
      measure,
    );

    expect(layout.width).toBeCloseTo(along * Math.SQRT2);
    expect(layout.height).toBeCloseTo(50);
    expect(layout.rotation).toBeCloseTo(45);
    expect(layout.px).toBeCloseTo(200);
    expect(layout.py).toBeCloseTo(100);
    expect(measure('hello', layout.fontSize) * layout.scaleX).toBeCloseTo(layout.width);
  });
});
