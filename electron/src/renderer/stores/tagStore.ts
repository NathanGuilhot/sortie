import { create } from 'zustand';

interface TagStore {
  tags: any[];
  setTags: (tags: any[]) => void;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  setTags: (tags) => set({ tags }),
}));