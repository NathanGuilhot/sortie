import type { MainIpcContext } from './context';
import { handleInvoke } from './context';

export function registerOcrHandlers({ dbService }: MainIpcContext): void {
  handleInvoke('ocrGet', async (_event, { imageId }) => {
    return dbService.getOcr(imageId);
  });

  handleInvoke('ocrEnsure', async (_event, { imageId }) => {
    if (!dbService.isOcrAvailable()) {
      return { available: false as const };
    }

    // Fire and forget — the renderer subscribes to the shared OCR update event for the
    // result. Surfacing the promise here would serialize every renderer call
    // behind the heavy inference queue.
    void dbService.ensureOcr(imageId).catch(() => undefined);
    return { available: true as const, state: dbService.getOcr(imageId) };
  });
}
