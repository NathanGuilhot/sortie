import { useCallback, useMemo, useRef, type DragEvent, type MouseEvent } from 'react';
import { Image } from 'shared';

export interface ImageDragOutProps {
  draggable: boolean;
  onMouseDown: (event: MouseEvent) => void;
  onDragStart: (event: DragEvent) => void;
}

export interface ImageDragOut {
  dragProps: ImageDragOutProps;
  consumeDidDrag: () => boolean;
}

/** Lets an image be dragged out of Sortie into another application. */
export function useImageDragOut(image: Image): ImageDragOut {
  const draggedRef = useRef(false);
  const filePath = image.file_path;

  const onMouseDown = useCallback(
    (event: MouseEvent) => {
      draggedRef.current = false;
      if (image.missing || event.button !== 0) return;
      void window.sortieAPI.prepareImageDrag(filePath).catch(() => {});
    },
    [filePath, image.missing],
  );

  const onDragStart = useCallback(
    (event: DragEvent) => {
      // Electron replaces the drag with a native OS one, so the HTML5 session
      // has to be cancelled first.
      event.preventDefault();
      if (image.missing) return;
      draggedRef.current = true;
      void window.sortieAPI.startImageDrag(filePath).catch(() => {});
    },
    [filePath, image.missing],
  );

  const consumeDidDrag = useCallback(() => {
    if (!draggedRef.current) return false;
    draggedRef.current = false;
    return true;
  }, []);

  const dragProps = useMemo(
    // A file that is no longer on disk would drop as a broken reference.
    () => ({ draggable: !image.missing, onMouseDown, onDragStart }),
    [image.missing, onMouseDown, onDragStart],
  );

  return { dragProps, consumeDidDrag };
}
