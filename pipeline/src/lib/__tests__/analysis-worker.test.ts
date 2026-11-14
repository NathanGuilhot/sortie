import { describe, expect, it } from 'vitest';
import path from 'path';
import { AnalysisWorker } from '../analysis-worker';

// Exercise the compiled worker entry used by packaged Electron, not an inline test worker.

describe('analysis worker lifecycle', () => {
  it('handles cancellation and then accepts new work', async () => {
    const worker = new AnalysisWorker(
      path.resolve(__dirname, '../../../dist/lib/duplicate-worker.js'),
    );
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(worker.match([], [], controller.signal)).rejects.toThrow('cancelled');
      expect(await worker.match([], [])).toEqual([]);
      await expect(worker.analyze('/no-such-image-sortie.png')).rejects.toThrow();
      expect(await worker.match([], [])).toEqual([]);
    } finally {
      await worker.close();
    }
  });
});
