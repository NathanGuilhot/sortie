import { create } from 'zustand';
import { Image, SearchResult } from 'shared';

interface ImageStore {
  images: Image[];
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  selectedImage: Image | null;
  setImages: (images: Image[]) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedImage: (image: Image | null) => void;
  fetchImages: (limit?: number, offset?: number, append?: boolean) => Promise<void>;
  searchImages: (query: string, limit?: number) => Promise<void>;
  updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
  filterByTags: (tags: string[], limit?: number, offset?: number) => Promise<void>;
  fetchFavorites: (limit?: number, offset?: number) => Promise<void>;
  filterByPerson: (personId: number, limit?: number, offset?: number) => Promise<void>;
  hideImage: (imageId: number) => Promise<void>;
  updateImageMetadata: (
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
    },
  ) => Promise<void>;
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  searchResults: [],
  loading: false,
  error: null,
  hasMore: true,
  selectedImage: null,
  setImages: (images) => set({ images }),
  setSearchResults: (results) => set({ searchResults: results }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedImage: (image) => set({ selectedImage: image }),
  fetchImages: async (limit = 100, offset = 0, append = false) => {
    set({ loading: true, error: null });
    try {
      const fetched = await window.sortieAPI.getImages(limit, offset);
      const hasMore = fetched.length >= limit;
      if (append) {
        set((state) => ({ images: [...state.images, ...fetched], loading: false, hasMore }));
      } else {
        set({ images: fetched, loading: false, hasMore });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  searchImages: async (query: string, limit = 50) => {
    set({ loading: true, error: null });
    try {
      const results = await window.sortieAPI.searchImages(query, limit);
      set({ searchResults: results, images: results, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  filterByTags: async (tags: string[], limit = 100, offset = 0) => {
    if (tags.length === 0) {
      await get().fetchImages(limit, offset);
      return;
    }
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.filterImages(tags, limit, offset);
      set({ images, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  updateImageTags: async (imageId: number, tags: string[]) => {
    set({ loading: true, error: null });
    try {
      await window.sortieAPI.updateImageTags(imageId, tags);
      await get().fetchImages();
      set({ loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  fetchFavorites: async (limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const fetched = await window.sortieAPI.getFavoriteImages(limit, offset);
      set({ images: fetched, loading: false, hasMore: fetched.length >= limit });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  filterByPerson: async (personId: number, limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.filterImagesByPerson(personId, limit, offset);
      set({ images, loading: false, hasMore: images.length >= limit });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  hideImage: async (imageId: number) => {
    try {
      await window.sortieAPI.hideImage(imageId);
      set((state) => ({
        images: state.images.filter((img) => img.id !== imageId),
        selectedImage: state.selectedImage?.id === imageId ? null : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
  updateImageMetadata: async (
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
    },
  ) => {
    try {
      await window.sortieAPI.updateImageMetadata(imageId, metadata);
      await get().fetchImages();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
}));
