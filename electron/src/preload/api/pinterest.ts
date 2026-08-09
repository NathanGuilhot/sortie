import type {
  PinterestBulkImportCancelResponse,
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestImportResponse,
  PinterestLoadMoreResponse,
  PinterestResult,
  PinterestScrapeResponse,
  PinterestTarget,
  SortieAPI,
} from 'shared';
import { invoke, invokeNone, subscribeEvent } from '../helpers';

export function createPinterestApi(): Pick<SortieAPI, 'pinterest'> {
  return {
    pinterest: {
      scrape: (input: string, target?: number): Promise<PinterestScrapeResponse> =>
        invoke('pinterestScrape', { input, target }),
      loadMore: (
        target: PinterestTarget,
        bookmarks: string[],
        desired?: number,
      ): Promise<PinterestLoadMoreResponse> =>
        invoke('pinterestLoadMore', { target, bookmarks, desired }),
      importPin: (pin: PinterestResult): Promise<PinterestImportResponse> =>
        invoke('pinterestImportPin', { pin }),
      startBulkImport: (args: { username: string; slug: string; hideAiGenerated: boolean }) =>
        invoke('pinterestStartBulkImport', args),
      cancelBulkImport: (jobId: string): Promise<PinterestBulkImportCancelResponse> =>
        invoke('pinterestCancelBulkImport', { jobId }),
      onBulkImportProgress: (callback: (progress: PinterestBulkImportProgress) => void) =>
        subscribeEvent('pinterestBulkImportProgress', callback),
      onBulkImportComplete: (callback: (summary: PinterestBulkImportSummary) => void) =>
        subscribeEvent('pinterestBulkImportComplete', callback),
      revealImportFolder: () => invokeNone('pinterestRevealImportFolder'),
      getImportFolder: () => invokeNone('pinterestGetImportFolder'),
    },
  };
}
