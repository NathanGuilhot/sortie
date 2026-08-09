import { afterEach, describe, expect, it } from 'vitest';
import { usePinterestImportStore } from '../pinterestImportStore';

describe('pinterestImportStore bulk reducers', () => {
  afterEach(() => usePinterestImportStore.getState().reset());

  it('ignores progress from a different job', () => {
    usePinterestImportStore.setState({
      bulkImport: {
        jobId: 'active',
        status: 'running',
        total: 10,
        imported: 1,
        skipped: 0,
        failed: 0,
        error: null,
      },
    });

    usePinterestImportStore.getState().applyBulkProgress({
      jobId: 'other',
      total: 20,
      imported: 9,
      skipped: 2,
      failed: 1,
    });

    expect(usePinterestImportStore.getState().bulkImport.imported).toBe(1);
  });

  it('marks completed pins imported and never downgrades them on a later failure', () => {
    usePinterestImportStore.setState({
      bulkImport: {
        jobId: 'active',
        status: 'running',
        total: 2,
        imported: 0,
        skipped: 0,
        failed: 0,
        error: null,
      },
    });
    const store = usePinterestImportStore.getState();
    store.applyBulkProgress({
      jobId: 'active',
      total: 2,
      imported: 1,
      skipped: 0,
      failed: 0,
      currentPinId: 'pin',
      currentImageId: 42,
    });
    store.applyBulkProgress({
      jobId: 'active',
      total: 2,
      imported: 1,
      skipped: 0,
      failed: 1,
      currentPinId: 'pin',
    });

    expect(usePinterestImportStore.getState().imports.pin).toEqual({
      status: 'imported',
      imageId: 42,
    });
  });

  it.each([
    ['done', 'done'],
    ['cancelled', 'cancelled'],
    ['error', 'error'],
  ] as const)('maps %s completion status', (summaryStatus, expectedStatus) => {
    usePinterestImportStore.setState({
      bulkImport: {
        jobId: 'active',
        status: 'running',
        total: 2,
        imported: 0,
        skipped: 0,
        failed: 0,
        error: null,
      },
    });

    usePinterestImportStore.getState().applyBulkComplete({
      jobId: 'active',
      status: summaryStatus,
      total: 2,
      imported: 1,
      skipped: 0,
      failed: 1,
      error: 'broken',
    });

    expect(usePinterestImportStore.getState().bulkImport).toMatchObject({
      jobId: null,
      status: expectedStatus,
      total: 2,
      imported: 1,
      failed: 1,
      error: 'broken',
    });
  });
});
