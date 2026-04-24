import { create } from 'zustand';
import { TagWithCount } from 'shared';

interface TagStore {
  tags: TagWithCount[];
  loading: boolean;
  error: string | null;
  setTags: (tags: TagWithCount[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchTags: () => Promise<void>;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  loading: false,
  error: null,
  setTags: (tags) => set({ tags }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  fetchTags: async () => {
    set({ loading: true, error: null });
    try {
      const tags = await window.sortieAPI.getTagsWithCounts();
      set({ tags, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
}));
