import { create } from 'zustand';
import { Board } from 'shared';

interface BoardStore {
  boards: Board[];
  loading: boolean;
  error: string | null;
  fetchBoards: () => Promise<void>;
  createBoard: (name: string, color?: string) => Promise<Board>;
  renameBoard: (id: number, name: string) => Promise<void>;
  setBoardColor: (id: number, color: string) => Promise<void>;
  deleteBoard: (id: number) => Promise<void>;
}

export const useBoardStore = create<BoardStore>((set) => ({
  boards: [],
  loading: false,
  error: null,
  fetchBoards: async () => {
    set({ loading: true, error: null });
    try {
      const boards = await window.sortieAPI.boards.list();
      set({ boards, loading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, loading: false });
    }
  },
  createBoard: async (name, color) => {
    const board = await window.sortieAPI.boards.create(name, color);
    set((state) => ({ boards: [...state.boards, board] }));
    return board;
  },
  renameBoard: async (id, name) => {
    await window.sortieAPI.boards.rename(id, name);
    set((state) => ({
      boards: state.boards.map((b) => (b.id === id ? { ...b, name } : b)),
    }));
  },
  setBoardColor: async (id, color) => {
    await window.sortieAPI.boards.setColor(id, color);
    set((state) => ({
      boards: state.boards.map((b) => (b.id === id ? { ...b, color } : b)),
    }));
  },
  deleteBoard: async (id) => {
    await window.sortieAPI.boards.delete(id);
    set((state) => ({ boards: state.boards.filter((b) => b.id !== id) }));
  },
}));
