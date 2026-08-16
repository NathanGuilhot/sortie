import { useEffect } from 'react';
import { showIpcError } from '../ipc';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';

export function OriginBackfillBridge() {
  const incrementOriginDataRevision = useUIStore((state) => state.incrementOriginDataRevision);

  useEffect(() => {
    return window.sortieAPI.onOriginBackfillComplete(() => {
      incrementOriginDataRevision();

      const selectedId = useImageStore.getState().selectedImage?.id;
      if (selectedId === undefined) return;
      void window.sortieAPI
        .getImage(selectedId)
        .then((image) => {
          if (image) useImageStore.getState().replaceImage(image);
        })
        .catch((error) => showIpcError(error, 'Failed to refresh image source'));
    });
  }, [incrementOriginDataRevision]);

  return null;
}
