import type {
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestImportResult,
  PinterestResult,
  PinterestSearchPage,
} from '../types';
import { IPC_CHANNELS } from '../ipc-channels';

export type PinterestTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

export type PinterestScrapeResponse =
  | { ok: true; target: PinterestTarget; page: PinterestSearchPage }
  | { ok: false; message: string };

export type PinterestLoadMoreResponse =
  | { ok: true; page: PinterestSearchPage }
  | { ok: false; message: string };

export type PinterestImportResponse =
  | { ok: true; result: PinterestImportResult }
  | { ok: false; message: string };

export type PinterestBulkImportStartResponse =
  | { ok: true; jobId: string }
  | { ok: false; message: string };

export type PinterestBulkImportCancelResponse = { ok: true } | { ok: false; message: string };

export interface PinterestApi {
  pinterest: {
    scrape: (input: string, target?: number) => Promise<PinterestScrapeResponse>;
    loadMore: (
      target: PinterestTarget,
      bookmarks: string[],
      desired?: number,
    ) => Promise<PinterestLoadMoreResponse>;
    importPin: (pin: PinterestResult) => Promise<PinterestImportResponse>;
    startBulkImport: (args: {
      username: string;
      slug: string;
      hideAiGenerated: boolean;
    }) => Promise<PinterestBulkImportStartResponse>;
    cancelBulkImport: (jobId: string) => Promise<PinterestBulkImportCancelResponse>;
    onBulkImportProgress: (callback: (progress: PinterestBulkImportProgress) => void) => () => void;
    onBulkImportComplete: (callback: (summary: PinterestBulkImportSummary) => void) => () => void;
    revealImportFolder: () => Promise<{ success: boolean }>;
    getImportFolder: () => Promise<string>;
  };
}

export const pinterestInvokeChannels = {
  pinterestScrape: IPC_CHANNELS.pinterest.scrape,
  pinterestLoadMore: IPC_CHANNELS.pinterest.loadMore,
  pinterestImportPin: IPC_CHANNELS.pinterest.importPin,
  pinterestStartBulkImport: IPC_CHANNELS.pinterest.startBulkImport,
  pinterestCancelBulkImport: IPC_CHANNELS.pinterest.cancelBulkImport,
  pinterestRevealImportFolder: IPC_CHANNELS.pinterest.revealImportFolder,
  pinterestGetImportFolder: IPC_CHANNELS.pinterest.getImportFolder,
} as const;

export interface PinterestInvokeArgsByKey {
  pinterestScrape: { input: string; target?: number };
  pinterestLoadMore: { target: PinterestTarget; bookmarks: string[]; desired?: number };
  pinterestImportPin: { pin: PinterestResult };
  pinterestStartBulkImport: {
    username: string;
    slug: string;
    hideAiGenerated: boolean;
  };
  pinterestCancelBulkImport: { jobId: string };
  pinterestRevealImportFolder: undefined;
  pinterestGetImportFolder: undefined;
}

export interface PinterestInvokeResultByKey {
  pinterestScrape: PinterestScrapeResponse;
  pinterestLoadMore: PinterestLoadMoreResponse;
  pinterestImportPin: PinterestImportResponse;
  pinterestStartBulkImport: PinterestBulkImportStartResponse;
  pinterestCancelBulkImport: PinterestBulkImportCancelResponse;
  pinterestRevealImportFolder: { success: boolean };
  pinterestGetImportFolder: string;
}
