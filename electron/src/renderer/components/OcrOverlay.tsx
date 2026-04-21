import { useEffect, useState, useMemo, Fragment } from 'react';
import type { OcrBlock } from 'shared';

// Only matches absolute http(s) URLs — relative paths in photos are almost
// never meaningful and would false-positive on every "word.word" token.
const URL_RE = /\bhttps?:\/\/[^\s<>"'()一-鿿]+/gi;

// Must match the fontFamily applied to each <span> so measureText uses the
// same metrics as the live render.
const OCR_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

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

interface Props {
  imageId: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
  imageLoaded: boolean;
}

export function OcrOverlay({ imageId, imgRef, imageLoaded }: Props) {
  const [blocks, setBlocks] = useState<OcrBlock[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlocks([]);

    window.sortieAPI.ocr
      .ensure(imageId)
      .then((res) => {
        if (cancelled) return;
        if (!res.available) {
          setAvailable(false);
          return;
        }
        setAvailable(true);
        if (res.state.status === 'done' || res.state.status === 'empty') {
          setBlocks(res.state.blocks);
        }
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    const unsubscribe = window.sortieAPI.ocr.onUpdated((payload) => {
      if (cancelled) return;
      if (payload.imageId !== imageId) return;
      setBlocks(payload.blocks);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [imageId]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !imageLoaded) return;

    const update = () => {
      const parent = img.offsetParent as HTMLElement | null;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      setRect({
        top: imgRect.top - parentRect.top,
        left: imgRect.left - parentRect.left,
        width: imgRect.width,
        height: imgRect.height,
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(img);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [imgRef, imageLoaded]);

  const rendered = useMemo(() => {
    if (!rect) return null;
    return blocks.map((block, i) => renderBlock(block, i, rect));
  }, [blocks, rect]);

  if (available === false) return null;
  if (!rect) return null;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
      data-ocr-overlay
    >
      {rendered}
    </div>
  );
}

function renderBlock(
  block: OcrBlock,
  index: number,
  rect: { width: number; height: number },
) {
  // Prefer the polygon if present — rotated text needs it. Fall back to the
  // axis-aligned bbox (covers the PaddleOCR "no polygon" case).
  const poly = block.polygon;
  let px: number;
  let py: number;
  let width: number;
  let height: number;
  let rotation = 0;

  if (poly) {
    const [tl, tr, , bl] = poly;
    const dx = tr[0] - tl[0];
    const dy = tr[1] - tl[1];
    width = Math.hypot(dx, dy) * rect.width;
    // Scale the minor axis separately because the image may have been
    // rendered at a different aspect than it was stored at.
    const hx = bl[0] - tl[0];
    const hy = bl[1] - tl[1];
    height = Math.hypot(hx * rect.width, hy * rect.height);
    px = tl[0] * rect.width;
    py = tl[1] * rect.height;
    rotation = Math.atan2(dy * rect.height, dx * rect.width) * (180 / Math.PI);
  } else {
    px = block.bbox.x * rect.width;
    py = block.bbox.y * rect.height;
    width = block.bbox.width * rect.width;
    height = block.bbox.height * rect.height;
  }

  // Height is a good proxy for the visible font's em-square; pick fontSize
  // from it, then correct the horizontal axis via scaleX so the rendered
  // glyph run exactly spans the OCR bbox — no matter which font the original
  // image used or how wide its glyphs were.
  const fontSize = Math.max(8, height * 0.9);
  const naturalWidth = measureTextWidth(block.text, fontSize);
  // Guard: bail out of scaling on zero-width measurements (all-whitespace
  // text or unsupported glyphs). Clamp extreme ratios so a spurious single-
  // character detection in a huge box doesn't stretch one glyph to absurdity.
  const rawScaleX = naturalWidth > 0 ? width / naturalWidth : 1;
  const scaleX = Math.max(0.2, Math.min(rawScaleX, 5));

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
        // Lets text get selected with a normal I-beam cursor; without this the
        // parent's pointer-events:none would kill selection too.
        pointerEvents: 'auto',
        userSelect: 'text',
        cursor: 'text',
        // Selection color is kept default (OS accent) — only the rectangle
        // shows on drag, glyphs stay transparent.
      }}
      data-ocr-block
    >
      {renderWithLinks(block.text)}
    </span>
  );
}

function renderWithLinks(text: string) {
  const parts: Array<string | { url: string }> = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ url: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return text;

  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <a
        key={i}
        href={part.url}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void window.sortieAPI.app.openExternal(part.url);
        }}
        style={{
          color: 'inherit',
          cursor: 'pointer',
          textDecoration: 'underline',
          textDecorationColor: 'rgba(255,255,255,0.35)',
        }}
      >
        {part.url}
      </a>
    ),
  );
}
