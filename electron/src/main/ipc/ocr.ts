import { ipcMain } from 'electron';
import type { MainIpcContext } from './context';

export function registerOcrHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle('ocr:get', async (_event, { imageId }: { imageId: number }) => {
    return dbService.getOcr(imageId);
  });

  ipcMain.handle('ocr:ensure', async (_event, { imageId }: { imageId: number }) => {
    if (!dbService.isOcrAvailable()) {
      return { available: false as const };
    }

    // Fire and forget — the renderer subscribes to 'ocr-updated' for the
    // result. Surfacing the promise here would serialize every renderer call
    // behind the heavy inference queue.
    void dbService.ensureOcr(imageId).catch(() => undefined);
    return { available: true as const, state: dbService.getOcr(imageId) };
  });
}
