import { create } from 'zustand';
import {
  Image,
  Query,
  SearchResult,
  isPaginatedSearchQuery,
  type SortieImageMetadataUpdate,
} from 'shared';
import { runIpcTask } from '../ipc';

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
  viewerBackStack: Image[];
  viewerForwardStack: Image[];

  setSelectedImage: (image: Image | null) => void;
  openImageViewer: (image: Image) => void;
  closeImageViewer: () => void;
  navigateImageViewer: (image: Image) => void;
  goBackImageViewer: () => void;
  goForwardImageViewer: () => void;
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
  updateImageMetadata: (imageId: number, metadata: SortieImageMetadataUpdate) => Promise<void>;
  recomputeEmbedding: (imageId: number) => Promise<boolean>;
}

function releasePreviewUrl(current: ActiveImageQuery | null) {
  if (current) URL.revokeObjectURL(current.previewUrl);
}

export const useImageStore = create<ImageStore>((set, get) => {
  const patchImageList = (images: Image[], imageId: number, updated: Image | null) =>
    updated ? images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)) : images;

  const patchUpdatedImage = (imageId: number, updated: Image | null) => {
    if (!updated) return;
    set((state) => ({
      images: state.images.map((img) => (img.id === imageId ? { ...img, ...updated } : img)),
      selectedImage: state.selectedImage?.id === imageId ? updated : state.selectedImage,
      viewerBackStack: patchImageList(state.viewerBackStack, imageId, updated),
      viewerForwardStack: patchImageList(state.viewerForwardStack, imageId, updated),
    }));
  };

  const removeImageFromState = (imageId: number) => {
    set((state) => ({
      images: state.images.filter((img) => img.id !== imageId),
      selectedImage: state.selectedImage?.id === imageId ? null : state.selectedImage,
      viewerBackStack: state.viewerBackStack.filter((img) => img.id !== imageId),
      viewerForwardStack: state.viewerForwardStack.filter((img) => img.id !== imageId),
    }));
  };

  const refreshImageAfterMutation = async (
    imageId: number,
    mutate: () => Promise<void>,
  ): Promise<boolean> => {
    const updated = await runIpcTask({
      run: async () => {
        await mutate();
        return await window.sortieAPI.getImage(imageId);
      },
      onSuccess: (updated) => patchUpdatedImage(imageId, updated),
      onError: (message) => set({ error: message }),
    });
    return updated !== null;
  };

  return {
    images: [],
    loading: false,
    error: null,
    hasMore: true,
    lastQuery: null,
    activeImageQuery: null,
    selectedImage: null,
    viewerBackStack: [],
    viewerForwardStack: [],

    setSelectedImage: (image) =>
      set(
        image
          ? { selectedImage: image }
          : { selectedImage: null, viewerBackStack: [], viewerForwardStack: [] },
      ),
    openImageViewer: (image) =>
      set({
        selectedImage: image,
        viewerBackStack: [],
        viewerForwardStack: [],
      }),
    closeImageViewer: () =>
      set({
        selectedImage: null,
        viewerBackStack: [],
        viewerForwardStack: [],
      }),
    navigateImageViewer: (image) => {
      const current = get().selectedImage;
      if (!current || current.id === image.id) {
        set({ selectedImage: image });
        return;
      }
      set((state) => ({
        selectedImage: image,
        viewerBackStack: [...state.viewerBackStack, current],
        viewerForwardStack: [],
      }));
    },
    goBackImageViewer: () => {
      const { selectedImage, viewerBackStack } = get();
      if (!selectedImage || viewerBackStack.length === 0) return;
      const previous = viewerBackStack[viewerBackStack.length - 1];
      set((state) => ({
        selectedImage: previous,
        viewerBackStack: state.viewerBackStack.slice(0, -1),
        viewerForwardStack: [selectedImage, ...state.viewerForwardStack],
      }));
    },
    goForwardImageViewer: () => {
      const { selectedImage, viewerForwardStack } = get();
      if (!selectedImage || viewerForwardStack.length === 0) return;
      const next = viewerForwardStack[0];
      set((state) => ({
        selectedImage: next,
        viewerBackStack: [...state.viewerBackStack, selectedImage],
        viewerForwardStack: state.viewerForwardStack.slice(1),
      }));
    },
    setImages: (images) => set({ images }),

    runQuery: async (q: Query) => {
      const limit = q.limit ?? DEFAULT_PAGE;
      const query: Query = { ...q, limit, offset: 0 };
      set({ loading: true, error: null });
      await runIpcTask({
        run: () => window.sortieAPI.query(query),
        onSuccess: (results) =>
          set({
            images: results,
            loading: false,
            hasMore: isPaginatedSearchQuery(query) && results.length >= limit,
            lastQuery: query,
          }),
        onError: (message) => set({ error: message, loading: false }),
      });
    },

    loadMore: async () => {
      const { lastQuery, images, loading, hasMore } = get();
      if (!lastQuery || !hasMore || loading) return;
      if (!isPaginatedSearchQuery(lastQuery)) return;
      const limit = lastQuery.limit ?? DEFAULT_PAGE;
      set({ loading: true, error: null });
      await runIpcTask({
        run: () =>
          window.sortieAPI.query({
            ...lastQuery,
            limit,
            offset: images.length,
          }),
        onSuccess: (more) =>
          set((state) => {
            const existing = new Set(state.images.map((img) => img.id));
            const deduped = more.filter((img) => !existing.has(img.id));
            return {
              images: [...state.images, ...deduped],
              hasMore: more.length >= limit,
              loading: false,
            };
          }),
        onError: (message) => set({ error: message, loading: false }),
      });
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
      await refreshImageAfterMutation(imageId, async () => {
        await window.sortieAPI.updateImageTags(imageId, tags);
      });
    },
    addToBoard: async (imageId: number, tagId: number) => {
      await refreshImageAfterMutation(imageId, async () => {
        await window.sortieAPI.boards.addImage(imageId, tagId);
      });
    },
    removeFromBoard: async (imageId: number, tagId: number) => {
      await refreshImageAfterMutation(imageId, async () => {
        await window.sortieAPI.boards.removeImage(imageId, tagId);
      });
    },
    fetchBoardImages: async (tagId: number, limit = 200, offset = 0) => {
      set({ loading: true, error: null });
      await runIpcTask({
        run: () => window.sortieAPI.boards.getImages(tagId, limit, offset),
        onSuccess: (images) => {
          releasePreviewUrl(get().activeImageQuery);
          set({
            images,
            loading: false,
            hasMore: images.length >= limit,
            lastQuery: null,
            activeImageQuery: null,
          });
        },
        onError: (message) => set({ error: message, loading: false }),
      });
    },
    reorderBoardImages: async (tagId: number, orderedImageIds: number[]) => {
      const previous = get().images;
      const byId = new Map(previous.map((img) => [img.id, img]));
      const optimistic = orderedImageIds
        .map((id) => byId.get(id))
        .filter((img): img is NonNullable<typeof img> => img != null);
      set({ images: optimistic });
      await runIpcTask({
        run: () => window.sortieAPI.boards.reorder(tagId, orderedImageIds),
        onError: (message) => set({ images: previous, error: message }),
      });
    },
    hideImage: async (imageId: number) => {
      await runIpcTask({
        run: () => window.sortieAPI.hideImage(imageId),
        onSuccess: () => removeImageFromState(imageId),
        onError: (message) => set({ error: message }),
      });
    },
    deleteImage: async (imageId: number) => {
      await runIpcTask({
        run: () => window.sortieAPI.deleteImage(imageId),
        onSuccess: () => removeImageFromState(imageId),
        onError: (message) => set({ error: message }),
      });
    },
    updateImageMetadata: async (imageId, metadata) => {
      await refreshImageAfterMutation(imageId, async () => {
        await window.sortieAPI.updateImageMetadata(imageId, metadata);
      });
    },
    recomputeEmbedding: async (imageId) =>
      refreshImageAfterMutation(imageId, async () => {
        await window.sortieAPI.recomputeEmbedding(imageId);
      }),
  };
});
