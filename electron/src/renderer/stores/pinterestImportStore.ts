import { create } from 'zustand';
import type {
  PinterestBulkImportProgress,
  PinterestBulkImportSummary,
  PinterestResult,
  PinterestTarget,
} from 'shared';

type ImportStatus = 'idle' | 'pending' | 'imported' | 'error';

interface ImportState {
  status: ImportStatus;
  imageId?: number;
  error?: string;
}

type BulkStatus = 'idle' | 'starting' | 'running' | 'cancelling' | 'done' | 'cancelled' | 'error';

export interface BulkImportState {
  jobId: string | null;
  status: BulkStatus;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  error: string | null;
}

const INITIAL_BULK: BulkImportState = {
  jobId: null,
  status: 'idle',
  total: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  error: null,
};

interface PinterestImportStore {
  query: string;
  target: PinterestTarget | null;
  boardPinCount: number | null;
  results: PinterestResult[];
  bookmarks: string[];
  isEnd: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  imports: Record<string, ImportState>;
  bulkImport: BulkImportState;
  reset(): void;
  search(input: string): Promise<void>;
  loadMore(): Promise<void>;
  importPin(pin: PinterestResult): Promise<void>;
  startBulkImport(hideAiGenerated: boolean): Promise<void>;
  cancelBulkImport(): Promise<void>;
  applyBulkProgress(progress: PinterestBulkImportProgress): void;
  applyBulkComplete(summary: PinterestBulkImportSummary): void;
}

export const usePinterestImportStore = create<PinterestImportStore>()((set, get) => ({
  query: '',
  target: null,
  boardPinCount: null,
  results: [],
  bookmarks: [],
  isEnd: false,
  loading: false,
  loadingMore: false,
  error: null,
  imports: {},
  bulkImport: INITIAL_BULK,

  reset: () =>
    set({
      query: '',
      target: null,
      boardPinCount: null,
      results: [],
      bookmarks: [],
      isEnd: false,
      loading: false,
      loadingMore: false,
      error: null,
      imports: {},
      bulkImport: INITIAL_BULK,
    }),

  search: async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    set({
      loading: true,
      error: null,
      results: [],
      bookmarks: [],
      isEnd: false,
      query: trimmed,
      target: null,
      boardPinCount: null,
      imports: {},
      bulkImport: INITIAL_BULK,
    });

    const response = await window.sortieAPI.pinterest.scrape(trimmed, 50);
    if (!response.ok) {
      set({ loading: false, error: response.message });
      return;
    }

    set({
      loading: false,
      results: response.page.results,
      bookmarks: response.page.bookmarks,
      isEnd: response.page.isEnd,
      target: response.target,
      boardPinCount: response.page.boardPinCount ?? null,
    });
  },

  loadMore: async () => {
    const state = get();
    if (state.loadingMore || state.loading) return;
    if (state.isEnd || !state.target || state.bookmarks.length === 0) return;

    set({ loadingMore: true, error: null });
    const response = await window.sortieAPI.pinterest.loadMore(state.target, state.bookmarks, 50);
    if (!response.ok) {
      set({ loadingMore: false, error: response.message });
      return;
    }

    set((current) => {
      const seen = new Set(current.results.map((result) => result.pinId));
      const merged = current.results.slice();
      for (const result of response.page.results) {
        if (!seen.has(result.pinId)) {
          seen.add(result.pinId);
          merged.push(result);
        }
      }

      return {
        loadingMore: false,
        results: merged,
        bookmarks: response.page.bookmarks,
        isEnd: response.page.isEnd,
      };
    });
  },

  importPin: async (pin) => {
    const current = get().imports[pin.pinId];
    if (current?.status === 'pending' || current?.status === 'imported') return;

    set((state) => ({
      imports: { ...state.imports, [pin.pinId]: { status: 'pending' } },
    }));

    const response = await window.sortieAPI.pinterest.importPin(pin);
    if (!response.ok) {
      set((state) => ({
        imports: {
          ...state.imports,
          [pin.pinId]: { status: 'error', error: response.message },
        },
      }));
      return;
    }

    set((state) => ({
      imports: {
        ...state.imports,
        [pin.pinId]: { status: 'imported', imageId: response.result.imageId },
      },
    }));
  },

  startBulkImport: async (hideAiGenerated) => {
    const state = get();
    if (state.bulkImport.status === 'running' || state.bulkImport.status === 'starting') return;
    if (!state.target || state.target.kind !== 'board') return;

    set({
      bulkImport: {
        ...INITIAL_BULK,
        status: 'starting',
        total: state.boardPinCount ?? 0,
      },
    });

    const response = await window.sortieAPI.pinterest.startBulkImport({
      username: state.target.username,
      slug: state.target.slug,
      hideAiGenerated,
    });
    if (!response.ok) {
      set({
        bulkImport: {
          ...INITIAL_BULK,
          status: 'error',
          error: response.message,
        },
      });
      return;
    }

    set((current) => ({
      bulkImport: { ...current.bulkImport, jobId: response.jobId, status: 'running' },
    }));
  },

  cancelBulkImport: async () => {
    const { bulkImport } = get();
    if (!bulkImport.jobId || bulkImport.status !== 'running') return;

    set((state) => ({ bulkImport: { ...state.bulkImport, status: 'cancelling' } }));
    await window.sortieAPI.pinterest.cancelBulkImport(bulkImport.jobId);
  },

  applyBulkProgress: (progress) => {
    set((state) => {
      if (state.bulkImport.jobId && progress.jobId !== state.bulkImport.jobId) return state;

      const nextBulkImport: BulkImportState = {
        ...state.bulkImport,
        jobId: progress.jobId,
        total: progress.total,
        imported: progress.imported,
        skipped: progress.skipped,
        failed: progress.failed,
      };

      let imports = state.imports;
      if (progress.currentPinId) {
        const existing = imports[progress.currentPinId];
        if (progress.currentImageId !== undefined) {
          if (existing?.status !== 'imported') {
            imports = {
              ...imports,
              [progress.currentPinId]: {
                status: 'imported',
                imageId: progress.currentImageId,
              },
            };
          }
        } else if (existing?.status !== 'error') {
          imports = {
            ...imports,
            [progress.currentPinId]: { status: 'error', error: 'Import failed' },
          };
        }
      }

      return { bulkImport: nextBulkImport, imports };
    });
  },

  applyBulkComplete: (summary) => {
    set((state) => {
      if (state.bulkImport.jobId && summary.jobId !== state.bulkImport.jobId) return state;

      const status: BulkStatus =
        summary.status === 'done'
          ? 'done'
          : summary.status === 'cancelled'
            ? 'cancelled'
            : 'error';

      return {
        bulkImport: {
          jobId: null,
          status,
          total: summary.total,
          imported: summary.imported,
          skipped: summary.skipped,
          failed: summary.failed,
          error: summary.error ?? null,
        },
      };
    });
  },
}));
