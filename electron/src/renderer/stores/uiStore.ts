import { create } from 'zustand';

interface UIStore {
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  tagFilters: string[];
  showHidden: boolean;
  showFavoritesOnly: boolean;
  personFilter: number | null;
  folderFilter: number | null;
  paletteFilters: string[];
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { start: Date | null; end: Date | null }) => void;
  setTagFilters: (tags: string[]) => void;
  setShowHidden: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setPersonFilter: (personId: number | null) => void;
  setFolderFilter: (folderId: number | null) => void;
  setPaletteFilters: (colors: string[]) => void;
  clearFilters: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  searchQuery: '',
  dateRange: { start: null, end: null },
  tagFilters: [],
  showHidden: false,
  showFavoritesOnly: false,
  personFilter: null,
  folderFilter: null,
  paletteFilters: [],
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDateRange: (range) => set({ dateRange: range }),
  setTagFilters: (tags) => set({ tagFilters: tags }),
  setShowHidden: (show) => set({ showHidden: show }),
  setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
  setPersonFilter: (personId) => set({ personFilter: personId }),
  setFolderFilter: (folderId) => set({ folderFilter: folderId }),
  setPaletteFilters: (colors) => set({ paletteFilters: colors }),
  clearFilters: () =>
    set({
      searchQuery: '',
      dateRange: { start: null, end: null },
      tagFilters: [],
      showHidden: false,
      showFavoritesOnly: false,
      personFilter: null,
      folderFilter: null,
      paletteFilters: [],
    }),
}));
