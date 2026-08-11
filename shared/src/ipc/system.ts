import type { AppSettingKey } from '../types';
import { IPC_CHANNELS } from '../ipc-channels';

export interface SystemApi {
  revealInFinder: (filePath: string) => Promise<{ success: boolean }>;
  copyImageToClipboard: (filePath: string) => Promise<{ success: boolean }>;
  prepareImageDrag: (filePath: string) => Promise<{ success: boolean }>;
  startImageDrag: (filePath: string) => Promise<{ success: boolean }>;
  getDatabasePath: () => Promise<string>;
  pickFolder: () => Promise<string | null>;
  settings: {
    get: (key: AppSettingKey) => Promise<string | null>;
    set: (key: AppSettingKey, value: string) => Promise<{ success: boolean }>;
  };
  app: {
    getVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<{ success: boolean }>;
    showAboutPanel: () => Promise<void>;
    onShowAbout: (callback: () => void) => () => void;
  };
}

export const systemInvokeChannels = {
  revealInFinder: IPC_CHANNELS.revealInFinder,
  copyImageToClipboard: IPC_CHANNELS.copyImageToClipboard,
  prepareImageDrag: IPC_CHANNELS.prepareImageDrag,
  startImageDrag: IPC_CHANNELS.startImageDrag,
  getDatabasePath: IPC_CHANNELS.getDatabasePath,
  pickFolder: IPC_CHANNELS.pickFolder,
  settingsGet: IPC_CHANNELS.settings.get,
  settingsSet: IPC_CHANNELS.settings.set,
  appGetVersion: IPC_CHANNELS.app.getVersion,
  appOpenExternal: IPC_CHANNELS.app.openExternal,
  appShowAboutPanel: IPC_CHANNELS.app.showAboutPanel,
} as const;

export interface SystemInvokeArgsByKey {
  revealInFinder: { filePath: string };
  copyImageToClipboard: { filePath: string };
  prepareImageDrag: { filePath: string };
  startImageDrag: { filePath: string };
  getDatabasePath: undefined;
  pickFolder: undefined;
  settingsGet: { key: AppSettingKey };
  settingsSet: { key: AppSettingKey; value: string };
  appGetVersion: undefined;
  appOpenExternal: { url: string };
  appShowAboutPanel: undefined;
}

export interface SystemInvokeResultByKey {
  revealInFinder: { success: boolean };
  copyImageToClipboard: { success: boolean };
  prepareImageDrag: { success: boolean };
  startImageDrag: { success: boolean };
  getDatabasePath: string;
  pickFolder: string | null;
  settingsGet: string | null;
  settingsSet: { success: boolean };
  appGetVersion: string;
  appOpenExternal: { success: boolean };
  appShowAboutPanel: void;
}
