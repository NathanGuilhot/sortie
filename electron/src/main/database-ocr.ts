import { createOcrEngine, type OcrEngine } from 'pipeline';
import { OcrBlock, OcrResult, OcrUpdatePayload, parseOptionalJson } from 'shared';
import { DatabaseManager } from 'pipeline';

export class DatabaseOcrService {
  private engine: OcrEngine | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private inFlight = new Map<number, Promise<OcrBlock[]>>();
  private updateListeners = new Set<(payload: OcrUpdatePayload) => void>();

  constructor(
    private readonly db: DatabaseManager,
    ocrModelsPath?: string,
  ) {
    if (ocrModelsPath) {
      this.engine = createOcrEngine({ modelsPath: ocrModelsPath });
    }
  }

  isAvailable(): boolean {
    return this.engine !== null;
  }

  get(imageId: number): OcrResult {
    const { status, at } = this.db.ocr.getOcrStatus(imageId);
    if (status !== 'done') {
      return { status, at, blocks: [] };
    }

    const rows = this.db.ocr.getImageOcr(imageId);
    const blocks: OcrBlock[] = rows.map((row) => ({
      text: row.text,
      bbox: { x: row.bbox_x, y: row.bbox_y, width: row.bbox_w, height: row.bbox_h },
      polygon: parseOptionalJson<OcrBlock['polygon']>(row.polygon_json) ?? undefined,
      confidence: row.confidence,
    }));

    return { status, at, blocks };
  }

  ensure(imageId: number): Promise<OcrBlock[]> {
    const cached = this.get(imageId);
    if (cached.status === 'done' || cached.status === 'empty') {
      return Promise.resolve(cached.blocks);
    }

    const existing = this.inFlight.get(imageId);
    if (existing) return existing;

    const run = (async () => {
      const filePath = this.db.images.getImagePath(imageId);
      if (!filePath) throw new Error(`Image ${imageId} not found`);

      await this.ensureReady();
      try {
        const blocks = await this.engine!.extract(filePath);
        this.db.ocr.saveImageOcr(imageId, blocks);
        this.notifyUpdate({
          imageId,
          status: blocks.length === 0 ? 'empty' : 'done',
          blocks,
        });
        return blocks;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[ocr] failed for image ${imageId}:`, error);
        this.db.ocr.markOcrError(imageId, message);
        this.notifyUpdate({ imageId, status: `error:${message}`, blocks: [] });
        throw error;
      }
    })();

    // Serialize OCR work to keep the CPU-heavy ONNX path from starving other
    // background jobs that share the same process.
    const serialized = this.queue.then(() => run).catch(() => undefined);
    this.queue = serialized as Promise<void>;
    this.inFlight.set(imageId, run);
    void run.finally(() => this.inFlight.delete(imageId));
    return run;
  }

  onUpdate(listener: (payload: OcrUpdatePayload) => void): () => void {
    this.updateListeners.add(listener);
    return () => {
      this.updateListeners.delete(listener);
    };
  }

  private async ensureReady(): Promise<void> {
    if (!this.engine) throw new Error('OCR not available (models not found)');
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.engine.initialize().then(() => {
      this.ready = true;
    });

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
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
