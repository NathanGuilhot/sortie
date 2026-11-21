import { useEffect, useState } from 'react';
import type { OcrBlock, OcrTextRange } from 'shared';
import { OcrTextLayer } from './OcrTextLayer';

interface Props {
  imageId: number;
  imgRef: React.RefObject<HTMLImageElement | null>;
  imageLoaded: boolean;
  /** Text matched by the current search, highlighted over the image. */
  highlights?: OcrTextRange[];
}

export function OcrOverlay({ imageId, imgRef, imageLoaded, highlights }: Props) {
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
    queueMicrotask(() => {
      if (!cancelled) setBlocks([]);
    });

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
      <OcrTextLayer
        blocks={blocks}
        width={rect.width}
        height={rect.height}
        highlights={highlights}
        interactive
      />
    </div>
  );
}
