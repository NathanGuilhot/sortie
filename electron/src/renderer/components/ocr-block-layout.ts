import type { OcrBlock } from 'shared';

export interface OcrBlockLayout {
  /** Top-left corner of the line, in px. */
  px: number;
  py: number;
  /** Line length and thickness, in px, along the text's own direction. */
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotation: number;
  fontSize: number;
  /** Horizontal stretch so the text, drawn in our font, spans the line exactly. */
  scaleX: number;
}

/**
 * Where an OCR line goes over an image shown at `rect` size. Text drawn at
 * `fontSize`, stretched by `scaleX`, then rotated about (px, py), lands on the
 * words in the image.
 */
export function layoutOcrBlock(
  block: OcrBlock,
  rect: { width: number; height: number },
  measureTextWidth: (text: string, fontSize: number) => number,
): OcrBlockLayout {
  // Prefer the polygon if present: rotated text needs it. Fall back to the
  // axis-aligned bbox (covers the PaddleOCR "no polygon" case).
  const poly = block.polygon;
  let px: number;
  let py: number;
  let width: number;
  let height: number;
  let rotation = 0;

  if (poly) {
    const [tl, tr, , bl] = poly;
    // Coordinates are fractions of the image's width and height: scale each
    // axis on its own before measuring, or tilted lines on non-square images
    // come out the wrong length.
    const dx = (tr[0] - tl[0]) * rect.width;
    const dy = (tr[1] - tl[1]) * rect.height;
    width = Math.hypot(dx, dy);
    height = Math.hypot((bl[0] - tl[0]) * rect.width, (bl[1] - tl[1]) * rect.height);
    px = tl[0] * rect.width;
    py = tl[1] * rect.height;
    rotation = Math.atan2(dy, dx) * (180 / Math.PI);
  } else {
    px = block.bbox.x * rect.width;
    py = block.bbox.y * rect.height;
    width = block.bbox.width * rect.width;
    height = block.bbox.height * rect.height;
  }

  // Height is a good proxy for the visible font's em-square; pick fontSize
  // from it, then correct the horizontal axis via scaleX so the rendered
  // glyph run exactly spans the OCR bbox: no matter which font the original
  // image used or how wide its glyphs were.
  const fontSize = Math.max(8, height * 0.9);
  const naturalWidth = measureTextWidth(block.text, fontSize);
  // Guard: bail out of scaling on zero-width measurements (all-whitespace
  // text or unsupported glyphs). Clamp extreme ratios so a spurious single-
  // character detection in a huge box doesn't stretch one glyph to absurdity.
  const rawScaleX = naturalWidth > 0 ? width / naturalWidth : 1;
  const scaleX = Math.max(0.2, Math.min(rawScaleX, 5));

  return { px, py, width, height, rotation, fontSize, scaleX };
}
