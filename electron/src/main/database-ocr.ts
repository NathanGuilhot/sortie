import { setTimeout as sleep } from 'timers/promises';
import type { DatabaseManager, OcrBlockRow, OcrJobStamp } from 'pipeline';
import { OcrBlock, OcrResult, OcrUpdatePayload, parseOptionalJson } from 'shared';
import { OcrCancelledError, type OcrLane } from './ocr-process-client';

/** Runs OCR on one file. In the app: {@link OcrProcessClient}. */
export interface OcrRunner {
  extract(filePath: string, lane: OcrLane): Promise<OcrBlock[]>;
  stop(): void;
}

// Pause between background images, so OCR never hogs the CPU for long.
const BACKGROUND_PAUSE_MS = 200;
// When every image has been through OCR, look for new ones this often.
const BACKGROUND_RECHECK_MS = 60_000;
// This many failures in a row means OCR itself is broken, not the images:
// fewer before any image succeeded this session, more after.
const MAX_FAILURE_STREAK_UNPROVEN = 3;
const MAX_FAILURE_STREAK = 10;

export function ocrRowToBlock(row: OcrBlockRow): OcrBlock {
  return {
    text: row.text,
    bbox: { x: row.bbox_x, y: row.bbox_y, width: row.bbox_w, height: row.bbox_h },
    polygon: parseOptionalJson<OcrBlock['polygon']>(row.polygon_json) ?? undefined,
    confidence: row.confidence,
  };
}

/** Waits `ms`, or less if `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return sleep(ms, undefined, { signal }).catch(() => undefined);
}

export class DatabaseOcrService {
  private runner: OcrRunner | null = null;
  private inFlight = new Map<number, Promise<OcrBlock[]>>();
  private updateListeners = new Set<(payload: OcrUpdatePayload) => void>();
  private backgroundAbort: AbortController | null = null;
  private backgroundDone: Promise<void> | null = null;
  // Failures wait here until a later image succeeds. If OCR is broken on this
  // machine (models, runtime), nothing succeeds, and no image gets marked
  // failed for good.
  private unconfirmedFailures = new Map<number, { message: string; stamp?: OcrJobStamp }>();
  private failureStreak = 0;
  private hasSucceeded = false;

  constructor(
    private readonly db: DatabaseManager,
    ocrModelsPath: string | undefined,
    createRunner: (modelsPath: string) => OcrRunner,
  ) {
    if (ocrModelsPath) this.runner = createRunner(ocrModelsPath);
  }

  isAvailable(): boolean {
    return this.runner !== null;
  }

  invalidate(imageId: number): void {
    this.db.ocr.invalidateImage(imageId);
    // A job still running is for the old file: its result is dropped, and the
    // next ensure() starts a new one.
    this.inFlight.delete(imageId);
    this.unconfirmedFailures.delete(imageId);
  }

  get(imageId: number): OcrResult {
    const { status, at } = this.db.ocr.getOcrStatus(imageId);
    if (status !== 'done') {
      return { status, at, blocks: [] };
    }
    return { status, at, blocks: this.db.ocr.getImageOcr(imageId).map(ocrRowToBlock) };
  }

  ensure(imageId: number, lane: OcrLane = 'interactive'): Promise<OcrBlock[]> {
    const cached = this.get(imageId);
    if (cached.status === 'done' || cached.status === 'empty') {
      return Promise.resolve(cached.blocks);
    }
    const runner = this.runner;
    if (!runner) return Promise.reject(new Error('OCR not available (models not found)'));

    const filePath = this.db.images.getImagePath(imageId);
    if (!filePath) return Promise.reject(new Error(`Image ${imageId} not found`));

    const existing = this.inFlight.get(imageId);
    if (existing) return existing;

    const stamp = this.db.ocr.stampJob(imageId) ?? undefined;
    const run = (async () => {
      let blocks: OcrBlock[];
      try {
        blocks = await runner.extract(filePath, lane);
      } catch (error) {
        if (error instanceof OcrCancelledError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ocr] failed for image ${imageId}:`, message);
        this.failureStreak += 1;
        this.unconfirmedFailures.set(imageId, { message, stamp });
        throw error;
      }
      this.failureStreak = 0;
      this.hasSucceeded = true;
      this.confirmFailures();
      if (this.db.ocr.saveImageOcr(imageId, blocks, stamp)) {
        this.notifyUpdate({ imageId, status: blocks.length === 0 ? 'empty' : 'done', blocks });
      }
      return blocks;
    })();

    this.inFlight.set(imageId, run);
    const forget = () => {
      if (this.inFlight.get(imageId) === run) this.inFlight.delete(imageId);
    };
    void run.then(forget, forget);
    return run;
  }

  /**
   * Runs OCR on every image that never had it, newest first, one at a time,
   * then keeps watching for new ones. Empty and failed results are not retried.
   */
  startBackgroundPass(): void {
    if (!this.runner || this.backgroundAbort) return;
    const controller = new AbortController();
    this.backgroundAbort = controller;
    this.backgroundDone = this.runBackgroundPass(controller.signal).catch((error: unknown) => {
      console.warn('[ocr] background pass stopped:', error);
    });
  }

  /** Stops the background pass and the OCR process. Call before closing the database. */
  async stop(): Promise<void> {
    this.backgroundAbort?.abort();
    this.runner?.stop();
    await this.backgroundDone;
  }

  onUpdate(listener: (payload: OcrUpdatePayload) => void): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  /** OCR works (an image just succeeded), so earlier failures were the images' fault. */
  private confirmFailures(): void {
    for (const [imageId, { message, stamp }] of this.unconfirmedFailures) {
      if (this.db.ocr.markOcrError(imageId, message, stamp)) {
        this.notifyUpdate({ imageId, status: `error:${message}`, blocks: [] });
      }
    }
    this.unconfirmedFailures.clear();
  }

  private async runBackgroundPass(signal: AbortSignal): Promise<void> {
    let cursor: number | null = null;
    while (!signal.aborted) {
      const imageId = this.db.ocr.nextImageNeedingOcr(cursor);
      if (imageId === null) {
        cursor = null;
        await wait(BACKGROUND_RECHECK_MS, signal);
        continue;
      }
      cursor = imageId;
      try {
        await this.ensure(imageId, 'background');
      } catch (error) {
        if (error instanceof OcrCancelledError) return;
        const limit = this.hasSucceeded ? MAX_FAILURE_STREAK : MAX_FAILURE_STREAK_UNPROVEN;
        if (this.failureStreak >= limit) {
          console.warn('[ocr] background pass stopped: OCR keeps failing on every image');
          return;
        }
      }
      await wait(BACKGROUND_PAUSE_MS, signal);
    }
  }

  private notifyUpdate(payload: OcrUpdatePayload): void {
    for (const listener of this.updateListeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error('[ocr] update listener error:', error);
      }
    }
  }
}
