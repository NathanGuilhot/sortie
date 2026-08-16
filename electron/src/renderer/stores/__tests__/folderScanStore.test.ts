import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFolderStore } from '../folderStore';
import { useFolderScanStore } from '../folderScanStore';
import { installSortieAPIStub } from '../../test/sortieApiStub';

type ScanResult = { cancelled: boolean; folderId: number; processed: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('folderScanStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useFolderScanStore.setState({ scanningFolder: null, scanProgress: null, scanHandle: null });
    useFolderStore.setState({
      folders: [],
      folderStats: [],
      totalImages: 0,
      totalSize: 0,
      loaded: false,
      statsLoaded: false,
    });
  });

  it('filters foreign progress, refreshes on completion, and clears scan state', async () => {
    const result = deferred<ScanResult>();
    const scanFolder = vi.fn<(path: string, opId: string) => Promise<ScanResult>>(
      () => result.promise,
    );
    const getFolders = vi.fn(async () => []);
    const getFoldersWithStats = vi.fn(async () => ({ folders: [], totalImages: 0, totalSize: 0 }));
    const stub = installSortieAPIStub({ scanFolder, getFolders, getFoldersWithStats });
    useFolderStore.setState({ statsLoaded: true });

    const scan = useFolderScanStore.getState().scanFolder('/photos');
    const opId = scanFolder.mock.calls[0][1];
    stub.emit('scanProgress', { opId: 'other', current: 5, total: 10, currentFile: 'other.jpg' });
    expect(useFolderScanStore.getState().scanProgress).toBeNull();

    stub.emit('scanProgress', { opId, current: 5, total: 10, currentFile: 'mine.jpg' });
    expect(useFolderScanStore.getState().scanProgress?.currentFile).toBe('mine.jpg');

    result.resolve({ cancelled: false, folderId: 1, processed: 10 });
    await scan;

    expect(getFolders).toHaveBeenCalledOnce();
    expect(getFoldersWithStats).toHaveBeenCalledOnce();
    expect(useFolderScanStore.getState().scanHandle).toBeNull();
    expect(useFolderScanStore.getState().scanningFolder).toBeNull();
  });

  it('ignores a second scan while one is running and cancels through its handle', async () => {
    const result = deferred<ScanResult>();
    const scanFolder = vi.fn<(path: string, opId: string) => Promise<ScanResult>>(
      () => result.promise,
    );
    const cancelOperation = vi.fn(async () => ({ cancelled: true }));
    installSortieAPIStub({
      scanFolder,
      cancelOperation,
      getFolders: vi.fn(async () => []),
      getFoldersWithStats: vi.fn(async () => ({ folders: [], totalImages: 0, totalSize: 0 })),
    });

    const first = useFolderScanStore.getState().scanFolder('/first');
    await useFolderScanStore.getState().scanFolder('/second');
    await useFolderScanStore.getState().cancelScan();
    await useFolderScanStore.getState().cancelScan();

    expect(scanFolder).toHaveBeenCalledOnce();
    expect(cancelOperation).toHaveBeenCalledOnce();
    result.resolve({ cancelled: true, folderId: 1, processed: 0 });
    await first;
  });

  it('clears state when starting the scan rejects', async () => {
    installSortieAPIStub({
      scanFolder: vi.fn(async () => {
        throw new Error("Error invoking remote method 'scan-folder': failed");
      }),
    });

    await expect(useFolderScanStore.getState().scanFolder('/photos')).rejects.toThrow('failed');
    expect(useFolderScanStore.getState().scanHandle).toBeNull();
    expect(useFolderScanStore.getState().scanProgress).toBeNull();
  });
});
