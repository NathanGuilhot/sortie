export interface WorkerPoolResult {
  cancelled: boolean;
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<WorkerPoolResult> {
  if (items.length === 0) return { cancelled: false };

  let nextIndex = 0;
  let cancelled = false;

  const run = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) {
        cancelled = true;
        return;
      }

      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      await worker(items[index], index);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => run()));
  return { cancelled };
}
