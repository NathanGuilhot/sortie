import { describe, expect, it, vi } from 'vitest';
import { runOperation } from '../runOperation';

describe('runOperation', () => {
  it('filters foreign progress and unsubscribes once', async () => {
    let progress: ((value: { opId: string; current: number }) => void) | undefined;
    const unsubscribe = vi.fn();
    const seen = vi.fn();
    const handle = runOperation({
      subscribe: (callback) => {
        progress = callback;
        return unsubscribe;
      },
      start: async () => 'done',
      onProgress: seen,
      deps: { mintId: () => 'mine' },
    });
    progress?.({ opId: 'other', current: 1 });
    progress?.({ opId: 'mine', current: 2 });
    await expect(handle.result).resolves.toBe('done');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
