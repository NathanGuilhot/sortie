import { create } from 'zustand';

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastStore {
  toasts: Toast[];
  pushToast: (message: string, kind: ToastKind) => void;
  dismissToast: (id: number) => void;
}

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  error: 5000,
  success: 2500,
  info: 2500,
};

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  pushToast: (message, kind) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS[kind]);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  error: (message: string) => useToastStore.getState().pushToast(message, 'error'),
  success: (message: string) => useToastStore.getState().pushToast(message, 'success'),
  info: (message: string) => useToastStore.getState().pushToast(message, 'info'),
};
