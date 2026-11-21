import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, seedImage, type TestDb } from 'pipeline';
import type { OcrBlock } from 'shared';
import { DatabaseOcrService, type OcrRunner } from '../database-ocr';
import { OcrCancelledError, type OcrLane } from '../ocr-process-client';

const block = (text: string): OcrBlock => ({
  text,
  bbox: { x: 0, y: 0, width: 1, height: 1 },
  confidence: 1,
});

class FakeRunner implements OcrRunner {
  calls: Array<{ filePath: string; lane: OcrLane }> = [];
  stopped = false;
  constructor(private readonly handle: (filePath: string) => Promise<OcrBlock[]>) {}
  extract(filePath: string, lane: OcrLane) {
    this.calls.push({ filePath, lane });
    return this.handle(filePath);
  }
  stop() {
    this.stopped = true;
  }
}

let t: TestDb;
afterEach(() => t?.close());

function service(runner: FakeRunner) {
  return new DatabaseOcrService(t.manager, '/models/ocr', () => runner);
}

describe('DatabaseOcrService', () => {
  it('saves OCR results and notifies listeners', async () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    const ocr = service(new FakeRunner(async () => [block('hello')]));
    const updates = vi.fn();
    ocr.onUpdate(updates);

    await expect(ocr.ensure(id)).resolves.toEqual([block('hello')]);
    expect(ocr.get(id).status).toBe('done');
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ imageId: id, status: 'done' }));
  });

  it('records a failure only once another image succeeds, and never a cancelled job', async () => {
    t = createTestDb();
    const failed = seedImage(t, '/failed.jpg');
    const cancelled = seedImage(t, '/cancelled.jpg');
    const fine = seedImage(t, '/fine.jpg');
    const ocr = service(
      new FakeRunner(async (filePath) => {
        if (filePath === '/failed.jpg') throw new Error('unreadable');
        if (filePath === '/cancelled.jpg') throw new OcrCancelledError();
        return [];
      }),
    );

    await expect(ocr.ensure(failed)).rejects.toThrow('unreadable');
    await expect(ocr.ensure(cancelled)).rejects.toBeInstanceOf(OcrCancelledError);
    expect(ocr.get(failed).status).toBeNull();

    await ocr.ensure(fine);
    expect(ocr.get(failed).status).toBe('error:unreadable');
    expect(ocr.get(cancelled).status).toBeNull();
  });

  it('when OCR fails on every image, stops the pass and marks nothing failed', async () => {
    t = createTestDb();
    const ids = [1, 2, 3, 4, 5].map((n) => seedImage(t, `/${n}.jpg`));
    const runner = new FakeRunner(async () => {
      throw new Error('models missing');
    });
    const ocr = service(runner);
    ocr.startBackgroundPass();
    await vi.waitFor(() => expect(runner.calls).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await ocr.stop();

    expect(runner.calls).toHaveLength(3);
    expect(ids.map((id) => ocr.get(id).status)).toEqual([null, null, null, null, null]);
  });

  it('runs OCR again after an edit, even while the old OCR is still running', async () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    let releaseOld!: (blocks: OcrBlock[]) => void;
    let calls = 0;
    const ocr = service(
      new FakeRunner(() => {
        calls += 1;
        if (calls === 1) return new Promise((resolve) => (releaseOld = resolve));
        return Promise.resolve([block('new')]);
      }),
    );

    const old = ocr.ensure(id, 'background');
    ocr.invalidate(id);
    t.raw.prepare("UPDATE images SET file_hash = 'edited' WHERE id = ?").run(id);
    await expect(ocr.ensure(id)).resolves.toEqual([block('new')]);
    releaseOld([block('old')]);
    await old;

    expect(ocr.get(id).blocks).toEqual([block('new')]);
  });

  it('drops a result when the file changed while OCR ran', async () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    const ocr = service(
      new FakeRunner(async () => {
        t.raw.prepare("UPDATE images SET file_hash = 'changed' WHERE id = ?").run(id);
        return [block('stale')];
      }),
    );
    await ocr.ensure(id);
    expect(ocr.get(id).status).toBeNull();
  });

  it('background pass: processes never-OCRed visible images newest first, skips empty and failed ones', async () => {
    t = createTestDb();
    const older = seedImage(t, '/older.jpg');
    const empty = seedImage(t, '/empty.jpg');
    const failed = seedImage(t, '/failed.jpg');
    const newer = seedImage(t, '/newer.jpg');
    seedImage(t, '/hidden.jpg', { hidden: true });
    t.manager.ocr.saveImageOcr(empty, []);
    t.manager.ocr.markOcrError(failed, 'boom');

    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const runner = new FakeRunner(async (filePath) => {
      if (filePath === '/older.jpg') finish();
      return [];
    });
    const ocr = service(runner);
    ocr.startBackgroundPass();
    await finished;
    await ocr.stop();

    expect(runner.calls).toEqual([
      { filePath: '/newer.jpg', lane: 'background' },
      { filePath: '/older.jpg', lane: 'background' },
    ]);
    expect(runner.stopped).toBe(true);
    expect([older, newer].map((id) => ocr.get(id).status)).toEqual(['empty', 'empty']);
  });
});
