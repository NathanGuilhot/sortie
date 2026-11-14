import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DuplicateScanResult } from 'shared';
import { useCleanupStore } from '../cleanupStore';
import { installSortieAPIStub } from '../../test/sortieApiStub';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const complete: DuplicateScanResult = { groups: [], cancelled: false, failed: 0, exactOnly: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
  useCleanupStore.setState({
    duplicateGroups: [],
    hasScanned: false,
    scanning: false,
    working: false,
    error: null,
    notice: null,
    scanHandle: null,
    scanProgress: null,
  });
});

describe('cleanup operation state', () => {
  it('ignores concurrent scans, filters progress and exposes incomplete results', async () => {
    const pending = deferred<DuplicateScanResult>();
    const scanDuplicates = vi.fn(() => pending.promise);
    const stub = installSortieAPIStub({ scanDuplicates });
    const work = useCleanupStore.getState().scanForDuplicates();
    await useCleanupStore.getState().scanForDuplicates();
    expect(scanDuplicates).toHaveBeenCalledOnce();
    stub.emit('hashProgress', {
      opId: 'unrelated',
      current: 9,
      total: 9,
      currentFile: 'secret-path',
    });
    expect(useCleanupStore.getState().scanProgress?.current).toBe(0);
    pending.resolve({ ...complete, failed: 2 });
    await work;
    expect(useCleanupStore.getState().notice).toContain('2 images could not be checked');
    expect(useCleanupStore.getState().hasScanned).toBe(true);
  });

  it('does not treat a cancelled scan as complete', async () => {
    installSortieAPIStub({ scanDuplicates: vi.fn(async () => ({ ...complete, cancelled: true })) });
    await useCleanupStore.getState().scanForDuplicates();
    expect(useCleanupStore.getState().hasScanned).toBe(false);
    expect(useCleanupStore.getState().scanHandle).toBeNull();
  });

  it('does not publish obsolete scan results after state has been replaced', async () => {
    const pending = deferred<DuplicateScanResult>();
    installSortieAPIStub({ scanDuplicates: vi.fn(() => pending.promise) });
    const work = useCleanupStore.getState().scanForDuplicates();
    useCleanupStore.setState({ scanHandle: null, scanning: false, notice: 'new state' });
    pending.resolve({ ...complete, failed: 3 });
    await work;
    expect(useCleanupStore.getState().notice).toBe('new state');
    expect(useCleanupStore.getState().hasScanned).toBe(false);
  });
});
