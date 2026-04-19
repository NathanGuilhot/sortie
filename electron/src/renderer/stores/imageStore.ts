import { create } from 'zustand';
import { Image, Query, SearchResult } from 'shared';

interface ActiveImageQuery {
  previewUrl: string;
  bytes: Uint8Array;
}

const DEFAULT_PAGE = 100;

interface ImageStore {
  images: SearchResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  lastQuery: Query | null;
  activeImageQuery: ActiveImageQuery | null;
  selectedImage: Image | null;

  setSelectedImage: (image: Image | null) => void;
  setImages: (images: SearchResult[]) => void;

  runQuery: (q: Query) => Promise<void>;
  loadMore: () => Promise<void>;
  setActiveImageQuery: (entry: ActiveImageQuery | null) => void;
  clearImageQuery: () => void;

  updateImageTags: (imageId: number, tags: string[]) => Promise<void>;
  addToBoard: (imageId: number, tagId: number) => Promise<void>;
  removeFromBoard: (imageId: number, tagId: number) => Promise<void>;
  fetchBoardImages: (tagId: number, limit?: number, offset?: number) => Promise<void>;
  reorderBoardImages: (tagId: number, orderedImageIds: number[]) => Promise<void>;
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

function releasePreviewUrl(current: ActiveImageQuery | null) {
  if (current) URL.revokeObjectURL(current.previewUrl);
}

// Only pure set-filter queries paginate; scored queries return their full ranked set.
function isPaginated(q: Query): boolean {
  const hasText = !!q.text && q.text.trim().length > 0;
  const hasBytes = !!q.imageBytes && q.imageBytes.byteLength > 0;
  const hasPalette = !!q.palette && q.palette.length > 0;
  return !(hasText || hasBytes || hasPalette);
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  loading: false,
  error: null,
  hasMore: true,
  lastQuery: null,
  activeImageQuery: null,
  selectedImage: null,

  setSelectedImage: (image) => set({ selectedImage: image }),
  setImages: (images) => set({ images }),

  runQuery: async (q: Query) => {
    const limit = q.limit ?? DEFAULT_PAGE;
    const query: Query = { ...q, limit, offset: 0 };
    set({ loading: true, error: null });
    try {
      const results = await window.sortieAPI.query(query);
      set({
        images: results,
        loading: false,
        hasMore: isPaginated(query) && results.length >= limit,
        lastQuery: query,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },

  loadMore: async () => {
    const { lastQuery, images, loading, hasMore } = get();
    if (!lastQuery || !hasMore || loading) return;
    if (!isPaginated(lastQuery)) return;
    const limit = lastQuery.limit ?? DEFAULT_PAGE;
    set({ loading: true, error: null });
    try {
      const more = await window.sortieAPI.query({
        ...lastQuery,
        limit,
        offset: images.length,
      });
      set((state) => {
        const existing = new Set(state.images.map((img) => img.id));
        const deduped = more.filter((img) => !existing.has(img.id));
        return {
          images: [...state.images, ...deduped],
          hasMore: more.length >= limit,
          loading: false,
        };
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },

  setActiveImageQuery: (entry) => {
    releasePreviewUrl(get().activeImageQuery);
    set({ activeImageQuery: entry });
  },

  clearImageQuery: () => {
    releasePreviewUrl(get().activeImageQuery);
    set({ activeImageQuery: null });
  },

  updateImageTags: async (imageId: number, tags: string[]) => {
    try {
      await window.sortieAPI.updateImageTags(imageId, tags);
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)),
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
        images: state.images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)),
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
        images: state.images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)),
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
      releasePreviewUrl(get().activeImageQuery);
      set({
        images,
        loading: false,
        hasMore: images.length >= limit,
        lastQuery: null,
        activeImageQuery: null,
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
  updateImageMetadata: async (imageId, metadata) => {
    try {
      await window.sortieAPI.updateImageMetadata(imageId, metadata);
      const updated = await window.sortieAPI.getImage(imageId);
      if (!updated) return;
      set((state) => ({
        images: state.images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)),
        selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
}));
