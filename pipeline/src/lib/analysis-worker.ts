import { Worker } from 'worker_threads';
import path from 'path';
import type { AnalysisTask } from './duplicate-worker';
import type { FileAnalysis, MatchedImages } from './duplicate-analysis';

export class AnalysisWorker {
  private worker: Worker | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly entryPath = path.join(__dirname, 'duplicate-worker.js')) {}

  analyze(filePath: string, signal?: AbortSignal): Promise<FileAnalysis> {
    return this.run({ kind: 'analyze', filePath }, signal);
  }

  match(
    images: Extract<AnalysisTask, { kind: 'match' }>['images'],
    dismissed: string[],
    signal?: AbortSignal,
  ): Promise<MatchedImages[]> {
    return this.run({ kind: 'match', images, dismissed }, signal);
  }

  private run<T>(task: AnalysisTask, signal?: AbortSignal): Promise<T> {
    const pending = this.tail.then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error('Scan cancelled'));
            return;
          }
          if (!this.worker) {
            const created = new Worker(this.entryPath);
            const forget = () => {
              if (this.worker === created) this.worker = null;
            };
            created.on('error', forget);
            created.on('exit', forget);
            this.worker = created;
          }
          const worker = this.worker;
          worker.ref();
          const finish = () => {
            worker.removeListener('message', onMessage);
            worker.removeListener('error', fail);
            worker.removeListener('exit', onExit);
            signal?.removeEventListener('abort', abort);
            worker.unref();
          };
          const fail = (error: Error) => {
            finish();
            this.worker = null;
            void worker.terminate();
            reject(error);
          };
          const abort = () => fail(new Error('Scan cancelled'));
          signal?.addEventListener('abort', abort, { once: true });
          const onMessage = (result: { value?: T; error?: string }) => {
            finish();
            if (result.error) reject(new Error(result.error));
            else resolve(result.value!);
          };
          const onExit = (code: number) => fail(new Error(`Image analysis stopped (${code}).`));
          worker.once('message', onMessage);
          worker.once('error', fail);
          worker.once('exit', onExit);
          worker.postMessage(task);
        }),
    );
    this.tail = pending.catch(() => undefined);
    return pending;
  }

  async close(): Promise<void> {
    await this.tail;
    await this.worker?.terminate();
    this.worker = null;
  }
}
