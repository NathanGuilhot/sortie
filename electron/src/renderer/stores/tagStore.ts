import { create } from 'zustand';
import { TagWithCount } from 'shared';
import { onCollectionInvalidation } from '../collectionInvalidation';

interface TagStore {
  tags: TagWithCount[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  setTags: (tags: TagWithCount[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchTags: () => Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,
  loaded: false,
  error: null,
  setTags: (tags) => set({ tags }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  fetchTags: async () => {
    set({ loading: true, error: null });
    try {
      const tags = await window.sortieAPI.getTagsWithCounts();
      set({ tags, loading: false, loaded: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
}));

onCollectionInvalidation(async () => {
  const state = useTagStore.getState();
  if (state.loaded) await state.fetchTags();
});
