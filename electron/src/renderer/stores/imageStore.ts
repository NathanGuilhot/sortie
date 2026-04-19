import { create } from 'zustand';
import { Image, SearchResult } from 'shared';

interface ImageStore {
  images: Image[];
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  activeSearchQuery: string | null;
  selectedImage: Image | null;
  setImages: (images: Image[]) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedImage: (image: Image | null) => void;
  fetchImages: (limit?: number, offset?: number, append?: boolean) => Promise<void>;
  searchImages: (query: string, limit?: number) => Promise<void>;
  searchMore: (limit?: number) => Promise<void>;
  updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
  addToBoard: (imageId: number, tagId: number) => Promise<void>;
  removeFromBoard: (imageId: number, tagId: number) => Promise<void>;
  fetchBoardImages: (tagId: number, limit?: number, offset?: number) => Promise<void>;
  reorderBoardImages: (tagId: number, orderedImageIds: number[]) => Promise<void>;
  filterByTags: (tags: string[], limit?: number, offset?: number) => Promise<void>;
  fetchFavorites: (limit?: number, offset?: number) => Promise<void>;
  filterByPerson: (personId: number, limit?: number, offset?: number) => Promise<void>;
  filterByFolder: (folderId: number, limit?: number, offset?: number) => Promise<void>;
  hideImage: (imageId: number) => Promise<void>;
  deleteImage: (imageId: number) => Promise<void>;
  updateImageMetadata: (
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
      website_link?: string | null;
    },
  ) => Promise<void>;
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  searchResults: [],
  loading: false,
  error: null,
  hasMore: true,
  activeSearchQuery: null,
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
        set((state) => {
          const existing = new Set(state.images.map((img) => img.id));
          const deduped = fetched.filter((img) => !existing.has(img.id));
          return { images: [...state.images, ...deduped], loading: false, hasMore };
        });
      } else {
        set({ images: fetched, loading: false, hasMore, activeSearchQuery: null });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  searchImages: async (query: string, limit = 50) => {
    set({ loading: true, error: null });
    try {
      const results = await window.sortieAPI.searchImages(query, limit, 0);
      set({
        searchResults: results,
        images: results,
        hasMore: results.length >= limit,
        activeSearchQuery: query,
        loading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  searchMore: async (limit = 50) => {
    const { activeSearchQuery, images, loading } = get();
    if (!activeSearchQuery || loading) return;
    set({ loading: true, error: null });
    try {
      const more = await window.sortieAPI.searchImages(activeSearchQuery, limit, images.length);
      set((state) => {
        const existing = new Set(state.images.map((img) => img.id));
        const deduped = more.filter((img) => !existing.has(img.id));
        return {
          images: [...state.images, ...deduped],
          searchResults: [...state.searchResults, ...deduped],
          hasMore: more.length >= limit,
          loading: false,
        };
      });
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
      set({
        images,
        loading: false,
        hasMore: images.length >= limit,
        activeSearchQuery: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  updateImageTags: async (imageId: number, tags: string[]) => {
    try {
      await window.sortieAPI.updateImageTags(imageId, tags);
      // Patch the edited image in place so the grid doesn't refetch the whole
      // list (which would discard scroll position and — now that the default
      // order is randomized per session — show a jarring re-shuffle).
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? updated : img)),
        selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
  addToBoard: async (imageId: number, tagId: number) => {
    try {
      await window.sortieAPI.boards.addImage(imageId, tagId);
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? updated : img)),
        selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
  removeFromBoard: async (imageId: number, tagId: number) => {
    try {
      await window.sortieAPI.boards.removeImage(imageId, tagId);
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? updated : img)),
        selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
  fetchBoardImages: async (tagId: number, limit = 200, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.boards.getImages(tagId, limit, offset);
      set({
        images,
        loading: false,
        hasMore: images.length >= limit,
        activeSearchQuery: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  reorderBoardImages: async (tagId: number, orderedImageIds: number[]) => {
    const previous = get().images;
    const byId = new Map(previous.map((img) => [img.id, img]));
    const optimistic = orderedImageIds
      .map((id) => byId.get(id))
      .filter((img): img is NonNullable<typeof img> => img != null);
    set({ images: optimistic });
    try {
      await window.sortieAPI.boards.reorder(tagId, orderedImageIds);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ images: previous, error: message });
    }
  },
  fetchFavorites: async (limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const fetched = await window.sortieAPI.getFavoriteImages(limit, offset);
      set({
        images: fetched,
        loading: false,
        hasMore: fetched.length >= limit,
        activeSearchQuery: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  filterByPerson: async (personId: number, limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.filterImagesByPerson(personId, limit, offset);
      set({
        images,
        loading: false,
        hasMore: images.length >= limit,
        activeSearchQuery: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  filterByFolder: async (folderId: number, limit = 100, offset = 0) => {
    set({ loading: true, error: null });
    try {
      const images = await window.sortieAPI.filterImagesByFolder(folderId, limit, offset);
      set({
        images,
        loading: false,
        hasMore: images.length >= limit,
        activeSearchQuery: null,
      });
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
  deleteImage: async (imageId: number) => {
    try {
      await window.sortieAPI.deleteImage(imageId);
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
      website_link?: string | null;
    },
  ) => {
    try {
      await window.sortieAPI.updateImageMetadata(imageId, metadata);
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? updated : img)),
        selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
}));
