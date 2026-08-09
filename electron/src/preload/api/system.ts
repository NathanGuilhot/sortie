import { type SortieAPI } from 'shared';
import { invoke, invokeNone, invokeWithUrl, subscribeEvent } from '../helpers';

export function createSystemApi(): Pick<
  SortieAPI,
  'revealInFinder' | 'copyImageToClipboard' | 'getDatabasePath' | 'pickFolder' | 'settings' | 'app'
> {
  return {
    revealInFinder: (filePath: string) => invoke('revealInFinder', { filePath }),
    copyImageToClipboard: (filePath: string) => invoke('copyImageToClipboard', { filePath }),
    getDatabasePath: () => invokeNone('getDatabasePath'),
    pickFolder: () => invokeNone('pickFolder'),
    settings: {
      get: (key) => invoke('settingsGet', { key }),
      set: (key, value) => invoke('settingsSet', { key, value }),
    },
    app: {
      getVersion: () => invokeNone('appGetVersion'),
      openExternal: (url: string) => invokeWithUrl('appOpenExternal', url),
      showAboutPanel: () => invokeNone('appShowAboutPanel'),
      onShowAbout: (callback: () => void) => subscribeEvent('showAbout', () => callback()),
    },
  };
}
