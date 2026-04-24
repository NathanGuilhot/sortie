import { ipcMain } from 'electron';
import { IPC_CHANNELS } from 'shared';
import type { MainIpcContext } from './context';

export function registerOcrHandlers({ dbService }: MainIpcContext): void {
  ipcMain.handle(IPC_CHANNELS.ocr.get, async (_event, { imageId }: { imageId: number }) => {
    return dbService.getOcr(imageId);
  });

  ipcMain.handle(IPC_CHANNELS.ocr.ensure, async (_event, { imageId }: { imageId: number }) => {
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
