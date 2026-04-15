import { create } from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  searchQuery: string;
  dateRange: { start: Date | null; end: Date | null };
  tagFilters: string[];
  showAIResults: boolean;
  showHidden: boolean;
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { start: Date | null; end: Date | null }) => void;
  setTagFilters: (tags: string[]) => void;
  setShowAIResults: (show: boolean) => void;
  setShowHidden: (show: boolean) => void;
  clearFilters: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  searchQuery: '',
  dateRange: { start: null, end: null },
  tagFilters: [],
  showAIResults: true,
  showHidden: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDateRange: (range) => set({ dateRange: range }),
  setTagFilters: (tags) => set({ tagFilters: tags }),
  setShowAIResults: (show) => set({ showAIResults: show }),
  setShowHidden: (show) => set({ showHidden: show }),
  clearFilters: () => set({ 
    searchQuery: '', 
    dateRange: { start: null, end: null }, 
    tagFilters: [],
    showAIResults: true,
    showHidden: false,
  }),
}));