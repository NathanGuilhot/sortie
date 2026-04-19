import { create } from 'zustand';
import type { PinterestResult } from 'shared';

type PinterestTarget =
  | { kind: 'search'; query: string }
  | { kind: 'board'; username: string; slug: string };

type ImportStatus = 'idle' | 'pending' | 'imported' | 'error';

interface ImportState {
  status: ImportStatus;
  imageId?: number;
  error?: string;
}

interface PinterestStore {
  query: string;
  target: PinterestTarget | null;
  results: PinterestResult[];
  bookmarks: string[];
  isEnd: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  imports: Record<string, ImportState>;

  setQuery: (q: string) => void;
  reset: () => void;
  search: (input: string) => Promise<void>;
  loadMore: () => Promise<void>;
  importPin: (pin: PinterestResult) => Promise<void>;
}

export const usePinterestStore = create<PinterestStore>((set, get) => ({
  query: '',
  target: null,
  results: [],
  bookmarks: [],
  isEnd: false,
  loading: false,
  loadingMore: false,
  error: null,
  imports: {},

  setQuery: (q) => set({ query: q }),

  reset: () =>
    set({
      query: '',
      target: null,
      results: [],
      bookmarks: [],
      isEnd: false,
      loading: false,
      loadingMore: false,
      error: null,
      imports: {},
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
      imports: {},
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
}));
