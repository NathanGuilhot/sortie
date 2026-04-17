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
      const allTags = await window.sortieAPI.getTagsWithCounts();
      const tags: TagWithCount[] = allTags.map((t) => ({
        id: t.id,
        name: t.name,
        category: (t.category || 'user') as TagWithCount['category'],
        color: t.color,
        created_at: t.created_at,
        usage_count: t.usage_count,
      }));
      set({ tags, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
}));
