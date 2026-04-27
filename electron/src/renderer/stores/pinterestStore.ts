import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PinterestStore {
  hideAiGenerated: boolean;
  setHideAiGenerated: (hide: boolean) => void;
}

export const usePinterestStore = create<PinterestStore>()(
  persist(
    (set) => ({
      hideAiGenerated: true,
      setHideAiGenerated: (hide) => set({ hideAiGenerated: hide }),
    }),
    {
      name: 'sortie:pinterest-prefs',
      partialize: (state) => ({ hideAiGenerated: state.hideAiGenerated }),
    },
  ),
);
