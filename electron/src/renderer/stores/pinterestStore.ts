import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PinterestBulkImportProgress, PinterestBulkImportSummary, PinterestResult } from 'shared';

type PinterestTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

type ImportStatus = 'idle' | 'pending' | 'imported' | 'error';

interface ImportState {
  status: ImportStatus;
  imageId?: number;
  error?: string;
}

type BulkStatus = 'idle' | 'starting' | 'running' | 'cancelling' | 'done' | 'cancelled' | 'error';

interface BulkImportState {
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

interface PinterestStore {
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
  hideAiGenerated: boolean;
  bulkImport: BulkImportState;

  setQuery: (q: string) => void;
  setHideAiGenerated: (hide: boolean) => void;
  reset: () => void;
  search: (input: string) => Promise<void>;
  loadMore: () => Promise<void>;
  importPin: (pin: PinterestResult) => Promise<void>;
  startBulkImport: () => Promise<void>;
  cancelBulkImport: () => Promise<void>;
  _applyBulkProgress: (progress: PinterestBulkImportProgress) => void;
  _applyBulkComplete: (summary: PinterestBulkImportSummary) => void;
}

export const usePinterestStore = create<PinterestStore>()(
  persist(
    (set, get) => ({
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
      hideAiGenerated: true,
      bulkImport: INITIAL_BULK,

      setQuery: (q) => set({ query: q }),

      setHideAiGenerated: (hide) => set({ hideAiGenerated: hide }),

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
        const res = await window.sortieAPI.pinterest.scrape(trimmed, 50);
        if (!res.ok) {
          set({ loading: false, error: res.message });
          return;
        }
        set({
          loading: false,
          results: res.page.results,
          bookmarks: res.page.bookmarks,
          isEnd: res.page.isEnd,
          target: res.target,
          boardPinCount: res.page.boardPinCount ?? null,
        });
      },

      loadMore: async () => {
        const state = get();
        if (state.loadingMore || state.loading) return;
        if (state.isEnd || !state.target || state.bookmarks.length === 0) return;
        set({ loadingMore: true, error: null });
        const res = await window.sortieAPI.pinterest.loadMore(state.target, state.bookmarks, 50);
        if (!res.ok) {
          set({ loadingMore: false, error: res.message });
          return;
        }
        set((s) => {
          const seen = new Set(s.results.map((r) => r.pinId));
          const merged = s.results.slice();
          for (const r of res.page.results) {
            if (!seen.has(r.pinId)) {
              seen.add(r.pinId);
              merged.push(r);
            }
          }
          return {
            loadingMore: false,
            results: merged,
            bookmarks: res.page.bookmarks,
            isEnd: res.page.isEnd,
          };
        });
      },

      importPin: async (pin) => {
        const current = get().imports[pin.pinId];
        if (current?.status === 'pending' || current?.status === 'imported') return;
        set((s) => ({
          imports: { ...s.imports, [pin.pinId]: { status: 'pending' } },
        }));
        const res = await window.sortieAPI.pinterest.importPin(pin);
        if (!res.ok) {
          set((s) => ({
            imports: {
              ...s.imports,
              [pin.pinId]: { status: 'error', error: res.message },
            },
          }));
          return;
        }
        set((s) => ({
          imports: {
            ...s.imports,
            [pin.pinId]: { status: 'imported', imageId: res.result.imageId },
          },
        }));
      },

      startBulkImport: async () => {
        const state = get();
        if (state.bulkImport.status === 'running' || state.bulkImport.status === 'starting') {
          return;
        }
        if (!state.target || state.target.kind !== 'board') return;
        set({
          bulkImport: {
            ...INITIAL_BULK,
            status: 'starting',
            total: state.boardPinCount ?? 0,
          },
        });
        const res = await window.sortieAPI.pinterest.startBulkImport({
          username: state.target.username,
          slug: state.target.slug,
          hideAiGenerated: state.hideAiGenerated,
        });
        if (!res.ok) {
          set({
            bulkImport: {
              ...INITIAL_BULK,
              status: 'error',
              error: res.message,
            },
          });
          return;
        }
        set((s) => ({
          bulkImport: { ...s.bulkImport, jobId: res.jobId, status: 'running' },
        }));
      },

      cancelBulkImport: async () => {
        const { bulkImport } = get();
        if (!bulkImport.jobId || bulkImport.status !== 'running') return;
        set((s) => ({ bulkImport: { ...s.bulkImport, status: 'cancelling' } }));
        await window.sortieAPI.pinterest.cancelBulkImport(bulkImport.jobId);
      },

      _applyBulkProgress: (p) => {
        set((s) => {
          // Ignore progress for a job we don't recognize (stale listener from a
          // previous job that just finished firing its last tick).
          if (s.bulkImport.jobId && p.jobId !== s.bulkImport.jobId) return s;
          const next: BulkImportState = {
            ...s.bulkImport,
            jobId: p.jobId,
            total: p.total,
            imported: p.imported,
            skipped: p.skipped,
            failed: p.failed,
          };
          // Reflect per-pin state so each card's badge flips as bulk progresses.
          let imports = s.imports;
          if (p.currentPinId) {
            const existing = imports[p.currentPinId];
            if (p.currentImageId !== undefined) {
              if (existing?.status !== 'imported') {
                imports = {
                  ...imports,
                  [p.currentPinId]: { status: 'imported', imageId: p.currentImageId },
                };
              }
            } else {
              // No imageId on this tick = import failed for that pin.
              if (existing?.status !== 'error') {
                imports = {
                  ...imports,
                  [p.currentPinId]: { status: 'error', error: 'Import failed' },
                };
              }
            }
          }
          return { bulkImport: next, imports };
        });
      },

      _applyBulkComplete: (summary) => {
        set((s) => {
          if (s.bulkImport.jobId && summary.jobId !== s.bulkImport.jobId) return s;
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
    }),
    {
      name: 'sortie:pinterest-prefs',
      partialize: (state) => ({ hideAiGenerated: state.hideAiGenerated }),
    },
  ),
);

// Subscribe once at module load — the main process broadcasts progress and
// completion events, and we fan them out into the store.
if (typeof window !== 'undefined' && window.sortieAPI?.pinterest) {
  window.sortieAPI.pinterest.onBulkImportProgress((p) =>
    usePinterestStore.getState()._applyBulkProgress(p),
  );
  window.sortieAPI.pinterest.onBulkImportComplete((summary) =>
    usePinterestStore.getState()._applyBulkComplete(summary),
  );
}
