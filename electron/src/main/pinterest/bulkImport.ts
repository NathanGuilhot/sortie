import type {
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestResult,
} from 'shared';
import type { DatabaseService } from '../database';
import { getBoardFeed, getBoardInfo, isEndBookmark, PinterestAPIError } from './api';
import { parsePins } from './parser';
import { importPin } from './import';

const PAGE_SIZE = 50;
const BATCH_DELAY_MS = 200;
const IMPORT_CONCURRENCY = 4;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
    void reject;
  });
}

export interface BulkImportBoardOptions {
  jobId: string;
  username: string;
  slug: string;
  hideAiGenerated: boolean;
}

export interface BulkImportDeps {
  dbService: DatabaseService;
  signal: AbortSignal;
  onProgress: (progress: PinterestBulkImportProgress) => void;
}

/**
 * Download every pin on a Pinterest board into the library.
 *
 * The queue interleaves page-fetches and per-pin downloads so the UI sees
 * steady progress rather than a big stall while the whole feed is paginated
 * up front. Pages are walked serially (gentle on Pinterest's feed endpoint),
 * but per-pin downloads run with small concurrency since those hit i.pinimg
 * on a different host.
 */
export async function bulkImportBoard(
  opts: BulkImportBoardOptions,
  deps: BulkImportDeps,
): Promise<PinterestBulkImportSummary> {
  const { jobId, username, slug, hideAiGenerated } = opts;
  const { dbService, signal, onProgress } = deps;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;
  let errorMessage: string | undefined;

  const seen = new Set<string>();

  // Resolve board once — we need the id for feed pagination and pinCount
  // for the initial progress total.
  let boardId: string;
  let pinCount: number;
  try {
    const info = await getBoardInfo(username, slug);
    boardId = info.boardId;
    pinCount = info.pinCount;
  } catch (err) {
    return {
      jobId,
      status: 'error',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  total = pinCount;
  onProgress({ jobId, total, imported, skipped, failed });

  // Simple concurrency pool: `active` tracks in-flight import promises,
  // `waiters` resolve as slots open up.
  const inflight = new Set<Promise<void>>();

  const runOne = async (pin: PinterestResult) => {
    try {
      const result = await importPin(pin, { dbService, signal });
      if (result.alreadyImported) skipped += 1;
      else imported += 1;
      onProgress({
        jobId,
        total,
        imported,
        skipped,
        failed,
        currentPinId: pin.pinId,
        currentImageId: result.imageId,
      });
    } catch (err) {
      // Abort errors bubble up as DOMException; don't count them as a
      // user-visible failure — the job summary will say 'cancelled'.
      if (signal.aborted) return;
      failed += 1;
      onProgress({
        jobId,
        total,
        imported,
        skipped,
        failed,
        currentPinId: pin.pinId,
      });
      void err;
    }
  };

  const enqueue = async (pin: PinterestResult) => {
    while (inflight.size >= IMPORT_CONCURRENCY) {
      await Promise.race(inflight);
    }
    if (signal.aborted) return;
    const p = runOne(pin);
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
  };

  let bookmarks: string[] = [];
  try {
    while (!signal.aborted) {
      const { pins, bookmarks: next } = await getBoardFeed({
        boardId,
        username,
        slug,
        pageSize: PAGE_SIZE,
        bookmarks,
      });
      if (signal.aborted) break;
      const parsed = parsePins(pins);
      for (const pin of parsed) {
        if (seen.has(pin.pinId)) continue;
        seen.add(pin.pinId);
        if (hideAiGenerated && pin.isAiGenerated) continue;
        await enqueue(pin);
        if (signal.aborted) break;
      }
      if (pins.length === 0 || isEndBookmark(next)) break;
      bookmarks = next;
      await sleep(BATCH_DELAY_MS, signal);
    }
  } catch (err) {
    if (!signal.aborted) {
      errorMessage =
        err instanceof PinterestAPIError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
    }
  }

  // Drain in-flight downloads. AbortSignal is already wired in, so on cancel
  // they reject quickly; on normal completion we just wait them out.
  await Promise.allSettled(Array.from(inflight));

  const status: PinterestBulkImportSummary['status'] = signal.aborted
    ? 'cancelled'
    : errorMessage
      ? 'error'
      : 'done';

  return {
    jobId,
    status,
    total,
    imported,
    skipped,
    failed,
    error: errorMessage,
  };
}
