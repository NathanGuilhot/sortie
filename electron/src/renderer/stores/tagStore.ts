import { create } from 'zustand';
import { Tag } from 'shared';

interface TagStore {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  setTags: (tags: Tag[]) => void;
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
      const allTags = await window.sortieAPI.getAllTags();
      const tags: Tag[] = allTags.map((t) => ({
        id: t.id,
        name: t.name,
        category: (t.category || 'user') as Tag['category'],
        color: t.color,
        created_at: t.created_at,
      }));
      set({ tags, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
}));
