import { create } from 'zustand';
import { EmbedderStatus } from 'shared';

interface EmbedderStore {
  status: EmbedderStatus;
  init: () => () => void;
}

export const useEmbedderStore = create<EmbedderStore>((set) => ({
  status: { state: 'idle' },
  init: () => {
    void window.sortieAPI.getEmbedderStatus().then((status) => set({ status }));
    return window.sortieAPI.onEmbedderStatus((status) => set({ status }));
  },
}));
