import type { SortieAPI } from 'shared';

export {};

declare global {
  interface Window {
    sortieAPI: SortieAPI;
  }
}
