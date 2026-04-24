import { ipcMain, shell } from 'electron';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS, IPC_EVENTS, type PinterestResult, type PinterestTarget } from 'shared';
import { getImportFolder, importPin } from '../pinterest/import';
import { bulkImportBoard } from '../pinterest/bulkImport';
import {
  PinterestAPIError,
  loadMore as pinterestLoadMore,
  parsePinterestInput,
  scrapeFirstPage,
} from '../pinterest/scraper';
import type { MainIpcContext } from './context';

async function pinterestResult<T extends object>(
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | { ok: false; message: string }> {
  try {
    const value = await run();
    return { ok: true, ...value };
  } catch (error) {
    const message =
      error instanceof PinterestAPIError || error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}

export function registerPinterestHandlers({
  dbService,
  bulkImportJobs,
}: MainIpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.pinterest.scrape,
    (_event, { input, target }: { input: string; target?: number }) =>
      pinterestResult(async () => {
        const parsed = parsePinterestInput(input);
        const page = await scrapeFirstPage(parsed, target ?? 50);
        return { target: parsed, page };
      }),
  );

  ipcMain.handle(
    IPC_CHANNELS.pinterest.loadMore,
    (
      _event,
      {
        target,
        bookmarks,
        desired,
      }: {
        target: PinterestTarget;
        bookmarks: string[];
        desired?: number;
      },
    ) =>
      pinterestResult(async () => ({
        page: await pinterestLoadMore(target, bookmarks, desired ?? 50),
      })),
  );

  ipcMain.handle(IPC_CHANNELS.pinterest.importPin, (_event, { pin }: { pin: PinterestResult }) =>
    pinterestResult(async () => ({ result: await importPin(pin, { dbService }) })),
  );

  ipcMain.handle(
    IPC_CHANNELS.pinterest.startBulkImport,
    async (
      event,
      {
        username,
        slug,
        hideAiGenerated,
      }: { username: string; slug: string; hideAiGenerated: boolean },
    ) => {
      const jobId = randomUUID();
      const controller = new AbortController();
      bulkImportJobs.set(jobId, controller);

      const sender = event.sender;
      const send = <T>(channel: string, payload: T) => {
        if (!sender.isDestroyed()) sender.send(channel, payload);
      };

      void (async () => {
        try {
          const summary = await bulkImportBoard(
            { jobId, username, slug, hideAiGenerated },
            {
              dbService,
              signal: controller.signal,
              onProgress: (progress) => send(IPC_EVENTS.pinterestBulkImportProgress, progress),
            },
          );
          send(IPC_EVENTS.pinterestBulkImportComplete, summary);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send(IPC_EVENTS.pinterestBulkImportComplete, {
            jobId,
            status: 'error' as const,
            total: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
            error: message,
          });
        } finally {
          bulkImportJobs.delete(jobId);
        }
      })();

      return { ok: true as const, jobId };
    },
  );

  ipcMain.handle(IPC_CHANNELS.pinterest.cancelBulkImport, async (_event, { jobId }: { jobId: string }) => {
    const controller = bulkImportJobs.get(jobId);
    if (!controller) return { ok: false as const, message: 'Job not found' };
    controller.abort();
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.pinterest.revealImportFolder, async () => {
    const dir = getImportFolder();
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.pinterest.getImportFolder, () => getImportFolder());
}
