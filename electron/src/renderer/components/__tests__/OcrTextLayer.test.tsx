import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { OcrBlock } from 'shared';
import { OcrMatchHighlight } from '../OcrMatchHighlight';
import { OcrTextLayer } from '../OcrTextLayer';
import { splitOcrText } from '../ocr-text-segments';

// jsdom has no canvas: text measures as 0 wide, so blocks keep their natural width.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const block = (text: string, index?: number): OcrBlock & { index?: number } => ({
  text,
  bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.1 },
  confidence: 1,
  index,
});

describe('splitOcrText', () => {
  it('keeps a link whole when a highlight falls inside it', () => {
    const segments = splitOcrText('go https://sale.com now', [{ start: 11, end: 15 }], true);
    expect(segments.map((s) => [s.text, s.url, s.highlighted])).toEqual([
      ['go ', null, false],
      ['https://', 'https://sale.com', false],
      ['sale', 'https://sale.com', true],
      ['.com', 'https://sale.com', false],
      [' now', null, false],
    ]);
  });
});

describe('OcrTextLayer', () => {
  it('marks the matched letters in the image view, and keeps links clickable', () => {
    const { container } = render(
      <OcrTextLayer
        blocks={[block('see https://a.com'), block('Big sale')]}
        width={400}
        height={300}
        highlights={[{ block: 1, start: 4, end: 8 }]}
        interactive
      />,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>('[data-ocr-highlight]'),
        (m) => m.textContent,
      ),
    ).toEqual(['sale']);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://a.com');
  });

  it('on thumbnails, matches highlights by block index and has no links or selection', () => {
    const { container } = render(
      <OcrTextLayer
        blocks={[block('https://sale.com', 3)]}
        width={1000}
        height={500}
        highlights={[{ block: 3, start: 8, end: 12 }]}
        interactive={false}
      />,
    );
    expect(container.querySelector('[data-ocr-highlight]')?.textContent).toBe('sale');
    expect(container.querySelector('a')).toBeNull();
    expect((container.querySelector('[data-ocr-block]') as HTMLElement).style.pointerEvents).toBe(
      'none',
    );
  });
});

describe('OcrMatchHighlight', () => {
  it('follows the cover crop of the thumbnail', () => {
    const { container } = render(
      <OcrMatchHighlight
        match={{
          blocks: [block('sale', 0) as OcrBlock & { index: number }],
          ranges: [{ block: 0, start: 0, end: 4 }],
        }}
        tileWidth={200}
        tileHeight={200}
        naturalWidth={400}
        naturalHeight={200}
      />,
    );
    // A 2:1 image in a square tile is shown 400x200 px, centred: 100 px cut on each side.
    const layer = container.querySelector('[data-ocr-match] > div') as HTMLElement;
    expect(layer.style.left).toBe('-100px');
    expect(layer.style.top).toBe('0px');
    expect(layer.style.transform).toBe('scale(0.4)');
    expect(container.querySelector('[data-ocr-highlight]')?.textContent).toBe('sale');
  });
});
