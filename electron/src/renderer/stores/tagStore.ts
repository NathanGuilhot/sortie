import { create } from 'zustand';
import { Tag } from 'shared';
import { TagSuggestion } from 'pipeline';

interface TagStore {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  selectedTags: Tag[];
  suggestions: TagSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  setTags: (tags: Tag[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedTags: (tags: Tag[]) => void;
  setSuggestions: (suggestions: TagSuggestion[]) => void;
  setSuggestionsLoading: (loading: boolean) => void;
  setSuggestionsError: (error: string | null) => void;
  fetchTags: () => Promise<void>;
  fetchSuggestions: (imageId: number) => Promise<void>;
  dismissSuggestion: (imageId: number, tagId: number) => Promise<void>;
  clearSuggestions: () => void;
  // Note: Tag creation/deletion may be handled via pipeline, but we can add actions later
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,
  error: null,
  selectedTags: [],
  suggestions: [],
  suggestionsLoading: false,
  suggestionsError: null,
  setTags: (tags) => set({ tags }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedTags: (tags) => set({ selectedTags: tags }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setSuggestionsLoading: (loading) => set({ suggestionsLoading: loading }),
  setSuggestionsError: (error) => set({ suggestionsError: error }),
  fetchTags: async () => {
    set({ loading: true, error: null });
    try {
      // TODO: Implement API endpoint for fetching tags
      // For now, we'll get tags from images
      const images = await window.sortieAPI.getImages(1000, 0);
      const tagSet = new Set<string>();
      images.forEach((img: any) => {
        if (img.tags) {
          img.tags.forEach((tag: string) => tagSet.add(tag));
        }
      });
      const tags: Tag[] = Array.from(tagSet).map((name, idx) => ({
        id: idx,
        name,
        category: 'user',
        color: '',
        created_at: new Date().toISOString(),
      }));
      set({ tags, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  fetchSuggestions: async (imageId: number) => {
    set({ suggestionsLoading: true, suggestionsError: null });
    try {
      const suggestions = await window.sortieAPI.getSuggestions(imageId);
      set({ suggestions, suggestionsLoading: false });
    } catch (error: any) {
      set({ suggestionsError: error.message, suggestionsLoading: false });
    }
  },
  dismissSuggestion: async (imageId: number, tagId: number) => {
    try {
      await window.sortieAPI.dismissSuggestion(imageId, tagId);
      // Remove dismissed suggestion from local state
      set((state) => ({
        suggestions: state.suggestions.filter(s => s.tagId !== tagId)
      }));
    } catch (error: any) {
      set({ suggestionsError: error.message });
    }
  },
  clearSuggestions: () => set({ suggestions: [], suggestionsError: null }),
}));