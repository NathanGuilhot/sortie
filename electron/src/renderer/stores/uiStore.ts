import { create } from 'zustand';

interface UIStore {
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  tagFilters: string[];
  showHidden: boolean;
  showFavoritesOnly: boolean;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { start: Date | null; end: Date | null }) => void;
  setTagFilters: (tags: string[]) => void;
  setShowHidden: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  clearFilters: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchQuery: '',
  dateRange: { start: null, end: null },
  tagFilters: [],
  showHidden: false,
  showFavoritesOnly: false,
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDateRange: (range) => set({ dateRange: range }),
  setTagFilters: (tags) => set({ tagFilters: tags }),
  setShowHidden: (show) => set({ showHidden: show }),
  setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
  clearFilters: () => set({
    searchQuery: '',
    dateRange: { start: null, end: null },
    tagFilters: [],
    showHidden: false,
    showFavoritesOnly: false,
  }),
}));