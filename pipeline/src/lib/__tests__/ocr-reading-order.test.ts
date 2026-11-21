import { describe, expect, it } from 'vitest';
import { sortInReadingOrder, type Quad } from '../ocr/reading-order';

// A box `width` x `height` at (x, y), rotated by `degrees` around the origin.
function line(text: string, x: number, y: number, width = 100, height = 20, degrees = 0) {
  const a = (degrees * Math.PI) / 180;
  const rotate = ([px, py]: number[]) => [
    px * Math.cos(a) - py * Math.sin(a),
    px * Math.sin(a) + py * Math.cos(a),
  ];
  const box: Quad = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map(rotate);
  return { text, box };
}

const texts = (lines: Array<{ text: string }>) => lines.map((l) => l.text);

describe('sortInReadingOrder', () => {
  it('reads rows top to bottom, words left to right', () => {
    const lines = [
      line('fade', 120, 40),
      line('print', 120, 0),
      line('this', 0, 0),
      line('will', 0, 40),
    ];
    expect(texts(sortInReadingOrder(lines))).toEqual(['this', 'print', 'will', 'fade']);
  });

  it('keeps tilted lines apart and in order', () => {
    // Two lines tilted 12°: the right end of the first sits lower than the
    // left end of the second, which is what used to merge them.
    const lines = [line('WILL FADE', 0, 30, 300, 25, 12), line('THIS PRINT', 10, 0, 300, 25, 12)];
    expect(texts(sortInReadingOrder(lines))).toEqual(['THIS PRINT', 'WILL FADE']);
  });
});
