import { getIpcErrorMessage } from '../ipc';

export interface RunOperationOptions<P extends { opId: string }, R> {
  subscribe: (cb: (progress: P) => void) => () => void;
  start: (opId: string) => Promise<R>;
  onProgress: (progress: P) => void;
  deps?: { cancelOperation?: (opId: string) => Promise<unknown>; mintId?: () => string };
}

export interface OperationHandle<R> {
  opId: string;
  result: Promise<R>;
  cancel: () => Promise<void>;
}

export function runOperation<P extends { opId: string }, R>(
  options: RunOperationOptions<P, R>,
): OperationHandle<R> {
  const opId = options.deps?.mintId?.() ?? crypto.randomUUID();
  let complete = false;
  let cancelled = false;
  const unsubscribe = options.subscribe((progress) => {
    if (progress.opId === opId) options.onProgress(progress);
  });
  const result = options
    .start(opId)
    .catch((error: unknown) => {
      throw new Error(getIpcErrorMessage(error), { cause: error });
    })
    .finally(() => {
      complete = true;
      unsubscribe();
    });

  return {
    opId,
    result,
    cancel: async () => {
      if (complete || cancelled) return;
      cancelled = true;
      await (options.deps?.cancelOperation ?? window.sortieAPI.cancelOperation)(opId);
    },
  };
}
