import { usePinterestImportStore } from './pinterestImportStore';

let eventsRegistered = false;

export function registerPinterestImportEvents(): void {
  if (eventsRegistered) return;
  if (typeof window === 'undefined' || !window.sortieAPI?.pinterest) return;

  eventsRegistered = true;
  window.sortieAPI.pinterest.onBulkImportProgress((progress) => {
    usePinterestImportStore.getState().applyBulkProgress(progress);
  });
  window.sortieAPI.pinterest.onBulkImportComplete((summary) => {
    usePinterestImportStore.getState().applyBulkComplete(summary);
  });
}

registerPinterestImportEvents();
