import { useEffect } from 'react';
import { useImageStore } from './imageStore';
import { useBoardStore } from './boardStore';
import { useCleanupStore } from './cleanupStore';
import { usePeopleStore } from './peopleStore';
import { useTagStore } from './tagStore';
import { toast } from './toastStore';

type HasError = { error: string | null; setError?: (e: string | null) => void };

/**
 * Subscribes to all stores that expose an `error` field. Whenever one
 * transitions to a non-null value, toast it and clear it so the user sees
 * every failure exactly once and the store can fire fresh errors later.
 */
export function useErrorToastBridge() {
  useEffect(() => {
    const stores = [
      useImageStore,
      useBoardStore,
      useCleanupStore,
      usePeopleStore,
      useTagStore,
    ];

    const unsubs = stores.map((store) =>
      store.subscribe((state: HasError, prev: HasError) => {
        if (state.error && state.error !== prev.error) {
          const message = state.error;
          state.setError?.(null);
          toast.error(message);
        }
      }),
    );

    const onUnhandled = (e: PromiseRejectionEvent) => {
      const reason: unknown = e.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      toast.error(message);
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);
}
