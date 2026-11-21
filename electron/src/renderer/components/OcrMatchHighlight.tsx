import type { OcrSearchMatch } from 'shared';
import { OcrTextLayer } from './OcrTextLayer';

// The text layer is laid out at this width, then scaled down to the tile, so
// the font-size floor and rounding of small tiles don't move the highlights.
const LAYOUT_WIDTH = 1000;

interface Props {
  match: OcrSearchMatch;
  tileWidth: number;
  tileHeight: number;
  /** The thumbnail's own size, to follow its `object-fit: cover` crop. */
  naturalWidth: number;
  naturalHeight: number;
}

/** Highlights the words a search matched on a gallery thumbnail. */
export function OcrMatchHighlight({
  match,
  tileWidth,
  tileHeight,
  naturalWidth,
  naturalHeight,
}: Props) {
  if (!naturalWidth || !naturalHeight || !tileWidth || !tileHeight) return null;

  // Same math as object-fit: cover, centred.
  const scale = Math.max(tileWidth / naturalWidth, tileHeight / naturalHeight);
  const shownWidth = naturalWidth * scale;
  const shownHeight = naturalHeight * scale;
  const layoutHeight = (LAYOUT_WIDTH * shownHeight) / shownWidth;

  return (
    <div
      aria-hidden
      data-ocr-match
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: (tileWidth - shownWidth) / 2,
          top: (tileHeight - shownHeight) / 2,
          width: LAYOUT_WIDTH,
          height: layoutHeight,
          transform: `scale(${shownWidth / LAYOUT_WIDTH})`,
          transformOrigin: '0 0',
        }}
      >
        <OcrTextLayer
          blocks={match.blocks}
          width={LAYOUT_WIDTH}
          height={layoutHeight}
          highlights={match.ranges}
          interactive={false}
        />
      </div>
    </div>
  );
}
