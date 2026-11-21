import { Fragment, useMemo, type ReactNode } from 'react';
import type { OcrBlock, OcrTextRange } from 'shared';
import { layoutOcrBlock } from './ocr-block-layout';
import { splitOcrText, type OcrTextSegment } from './ocr-text-segments';

// Must match the fontFamily applied to each <span> so measureText uses the
// same metrics as the live render.
const OCR_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const HIGHLIGHT_STYLE = {
  backgroundColor: 'rgba(250, 204, 21, 0.45)',
  boxShadow: '0 0 0 0.08em rgba(234, 179, 8, 0.9)',
  borderRadius: '0.12em',
  color: 'transparent',
} as const;

let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, fontSize: number): number {
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return 0;
  measureCtx.font = `${fontSize}px ${OCR_FONT_FAMILY}`;
  return measureCtx.measureText(text).width;
}

type OcrLayerBlock = OcrBlock & { index?: number };

interface Props {
  blocks: OcrLayerBlock[];
  /** Size of the box the image fills, in px. Block coordinates are fractions of it. */
  width: number;
  height: number;
  /** Text to highlight; `block` is the block's `index`, or its position when unset. */
  highlights?: OcrTextRange[];
  /** Selectable text and clickable links (image view), or highlights only (thumbnails). */
  interactive: boolean;
}

/**
 * Transparent OCR text laid exactly over the words in the image, so it can be
 * selected, clicked (links) and highlighted where the words are.
 */
export function OcrTextLayer({ blocks, width, height, highlights, interactive }: Props) {
  const rendered = useMemo(() => {
    const byBlock = new Map<number, OcrTextRange[]>();
    for (const range of highlights ?? []) {
      const list = byBlock.get(range.block);
      if (list) list.push(range);
      else byBlock.set(range.block, [range]);
    }
    return blocks.map((block, position) =>
      renderBlock(
        block,
        position,
        { width, height },
        byBlock.get(block.index ?? position) ?? [],
        interactive,
      ),
    );
  }, [blocks, width, height, highlights, interactive]);

  return <>{rendered}</>;
}

function renderBlock(
  block: OcrBlock,
  index: number,
  rect: { width: number; height: number },
  highlights: OcrTextRange[],
  interactive: boolean,
) {
  const { px, py, width, height, rotation, fontSize, scaleX } = layoutOcrBlock(
    block,
    rect,
    measureTextWidth,
  );

  return (
    <span
      key={index}
      className="absolute block whitespace-pre leading-none text-transparent"
      style={{
        top: 0,
        left: 0,
        // Order matters: translate places the baseline origin, rotate aligns
        // with the text direction, then scaleX stretches along that baseline.
        // Putting scaleX before rotate would stretch along the screen X axis
        // and skew rotated lines.
        transform: `translate(${px}px, ${py}px) rotate(${rotation}deg) scaleX(${scaleX})`,
        transformOrigin: '0 0',
        width,
        height,
        fontSize: `${fontSize}px`,
        fontFamily: OCR_FONT_FAMILY,
        ...(interactive
          ? {
              // Lets text get selected with a normal I-beam cursor; without this the
              // parent's pointer-events:none would kill selection too.
              pointerEvents: 'auto' as const,
              userSelect: 'text' as const,
              cursor: 'text',
              // Selection color is kept default (OS accent): only the rectangle
              // shows on drag, glyphs stay transparent.
            }
          : { pointerEvents: 'none' as const, userSelect: 'none' as const }),
      }}
      data-ocr-block
    >
      {renderText(block.text, highlights, interactive)}
    </span>
  );
}

function renderText(text: string, highlights: OcrTextRange[], interactive: boolean): ReactNode {
  const segments = splitOcrText(text, highlights, interactive);
  if (segments.length === 1 && !segments[0].url && !segments[0].highlighted) return text;

  // Consecutive pieces of the same link share one <a>.
  const groups: Array<{ url: string | null; segments: OcrTextSegment[] }> = [];
  for (const segment of segments) {
    const last = groups[groups.length - 1];
    if (last && last.url !== null && last.url === segment.url) last.segments.push(segment);
    else groups.push({ url: segment.url, segments: [segment] });
  }

  return groups.map((group, i) => {
    const pieces = group.segments.map((segment, j) =>
      segment.highlighted ? (
        <mark key={j} style={HIGHLIGHT_STYLE} data-ocr-highlight>
          {segment.text}
        </mark>
      ) : (
        <Fragment key={j}>{segment.text}</Fragment>
      ),
    );
    if (!group.url) return <Fragment key={i}>{pieces}</Fragment>;
    const url = group.url;
    return (
      <a
        key={i}
        href={url}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void window.sortieAPI.app.openExternal(url);
        }}
        style={{
          color: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(255,255,255,0.35)',
        }}
      >
        {pieces}
      </a>
    );
  });
}
