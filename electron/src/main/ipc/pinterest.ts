import { shell } from 'electron';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { type PinterestErrorCode } from 'shared';
import { getImportFolder, importPin } from '../pinterest/import';
import { bulkImportBoard } from '../pinterest/bulkImport';
import {
  PinterestAPIError,
  loadMore as pinterestLoadMore,
  parsePinterestInput,
  scrapeFirstPage,
} from '../pinterest/scraper';
import type { MainIpcContext } from './context';
import { handleInvoke } from './context';
import { emitterFor } from './events';

async function pinterestResult<T extends object>(
  run: () => Promise<T>,
): Promise<({ ok: true } & T) | { ok: false; message: string; code: PinterestErrorCode }> {
  try {
    const value = await run();
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof PinterestAPIError) {
      return { ok: false, message: error.message, code: error.code };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message, code: 'unknown' };
  }
}

export function registerPinterestHandlers({ dbService, bulkImportJobs }: MainIpcContext): void {
  handleInvoke('pinterestScrape', (_event, { input, target }) =>
    pinterestResult(async () => {
      const parsed = parsePinterestInput(input);
      const page = await scrapeFirstPage(parsed, target ?? 50);
      return { target: parsed, page };
    }),
  );

  handleInvoke('pinterestLoadMore', (_event, { target, bookmarks, desired }) =>
    pinterestResult(async () => ({
      page: await pinterestLoadMore(target, bookmarks, desired ?? 50),
    })),
  );

  handleInvoke('pinterestImportPin', (_event, { pin }) =>
    pinterestResult(async () => ({ result: await importPin(pin, { dbService }) })),
  );

  handleInvoke('pinterestStartBulkImport', async (event, { username, slug, hideAiGenerated }) => {
    const jobId = randomUUID();
    const controller = new AbortController();
    bulkImportJobs.set(jobId, controller);

    const progressEmitter = emitterFor(event.sender, 'pinterestBulkImportProgress');
    const completeEmitter = emitterFor(event.sender, 'pinterestBulkImportComplete');

    void (async () => {
      try {
        const summary = await bulkImportBoard(
          { jobId, username, slug, hideAiGenerated },
          {
            dbService,
            signal: controller.signal,
            onProgress: progressEmitter,
          },
        );
        completeEmitter(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        completeEmitter({
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
  });

  handleInvoke('pinterestCancelBulkImport', async (_event, { jobId }) => {
    const controller = bulkImportJobs.get(jobId);
    if (!controller) {
      return { ok: false as const, message: 'Job not found', code: 'not_found' as const };
    }
    controller.abort();
    return { ok: true as const };
  });

  handleInvoke('pinterestRevealImportFolder', async () => {
    const dir = getImportFolder();
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { success: true };
  });

  handleInvoke('pinterestGetImportFolder', () => getImportFolder());
}
