import { create } from 'zustand';
import type { OriginKind } from 'shared';

export type OriginFilter = { kind?: OriginKind; domain?: string } | null;

interface UIStore {
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  tagFilters: string[];
  showHidden: boolean;
  showFavoritesOnly: boolean;
  personFilter: number | null;
  folderFilter: number | null;
  paletteFilters: string[];
  originFilter: OriginFilter;
  originDataRevision: number;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { start: Date | null; end: Date | null }) => void;
  setTagFilters: (tags: string[]) => void;
  setShowHidden: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setPersonFilter: (personId: number | null) => void;
  setFolderFilter: (folderId: number | null) => void;
  setPaletteFilters: (colors: string[]) => void;
  setOriginFilter: (origin: OriginFilter) => void;
  incrementOriginDataRevision: () => void;
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
  originFilter: null,
  originDataRevision: 0,
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDateRange: (range) => set({ dateRange: range }),
  setTagFilters: (tags) => set({ tagFilters: tags }),
  setShowHidden: (show) => set({ showHidden: show }),
  setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),
  setPersonFilter: (personId) => set({ personFilter: personId }),
  setFolderFilter: (folderId) => set({ folderFilter: folderId }),
  setPaletteFilters: (colors) => set({ paletteFilters: colors }),
  setOriginFilter: (origin) => set({ originFilter: origin }),
  incrementOriginDataRevision: () =>
    set((state) => ({ originDataRevision: state.originDataRevision + 1 })),
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
      originFilter: null,
    }),
}));
