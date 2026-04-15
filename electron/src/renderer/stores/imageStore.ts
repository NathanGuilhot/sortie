import { create } from 'zustand';
import { Image, SearchResult } from 'shared';
import { TagSuggestion } from 'pipeline';

interface ImageStore {
  images: Image[];
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;
  selectedImage: Image | null;
  suggestions: TagSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  setImages: (images: Image[]) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedImage: (image: Image | null) => void;
  setSuggestions: (suggestions: TagSuggestion[]) => void;
  setSuggestionsLoading: (loading: boolean) => void;
  setSuggestionsError: (error: string | null) => void;
  fetchImages: (limit?: number, offset?: number) => Promise<void>;
  searchImages: (query: string, limit?: number) => Promise<void>;
  updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
  fetchSuggestions: (imageId: number) => Promise<void>;
  dismissSuggestion: (imageId: number, tagId: number) => Promise<void>;
  clearSuggestions: () => void;
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  searchResults: [],
  loading: false,
  error: null,
  selectedImage: null,
  suggestions: [],
  suggestionsLoading: false,
  suggestionsError: null,
  setImages: (images) => set({ images }),
  setSearchResults: (results) => set({ searchResults: results }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedImage: (image) => set({ selectedImage: image }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setSuggestionsLoading: (loading) => set({ suggestionsLoading: loading }),
  setSuggestionsError: (error) => set({ suggestionsError: error }),
  fetchImages: async (limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.getImages(limit, offset);
      set({ images, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  searchImages: async (query: string, limit = 50) => {
    set({ loading: true, error: null });
    try {
      const results = await window.sortieAPI.searchImages(query, limit);
      set({ searchResults: results, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  updateImageTags: async (imageId: number, tags: string[]) => {
    set({ loading: true, error: null });
    try {
      await window.sortieAPI.updateImageTags(imageId, tags);
      // Refresh the images list to reflect changes
      await get().fetchImages();
      set({ loading: false });
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