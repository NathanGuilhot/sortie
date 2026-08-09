import { type EventKey, type EventPayloadByKey, type SortieAPI } from 'shared';
import { vi } from 'vitest';

type Subscriber = (payload: never) => void;

export function installSortieAPIStub(overrides: Partial<SortieAPI> = {}) {
  const subscribers = new Map<EventKey, Set<Subscriber>>();
  const on = <K extends EventKey>(key: K, callback: (payload: EventPayloadByKey[K]) => void) => {
    const set = subscribers.get(key) ?? new Set<Subscriber>();
    set.add(callback as Subscriber);
    subscribers.set(key, set);
    return () => set.delete(callback as Subscriber);
  };
  const api = {
    ...overrides,
    onScanProgress: (callback: (payload: EventPayloadByKey['scanProgress']) => void) =>
      on('scanProgress', callback),
    onHashProgress: (callback: (payload: EventPayloadByKey['hashProgress']) => void) =>
      on('hashProgress', callback),
    onPaletteProgress: (callback: (payload: EventPayloadByKey['paletteProgress']) => void) =>
      on('paletteProgress', callback),
    onFaceScanProgress: (callback: (payload: EventPayloadByKey['faceScanProgress']) => void) =>
      on('faceScanProgress', callback),
    onEmbedderStatus: (callback: (payload: EventPayloadByKey['embedderStatus']) => void) =>
      on('embedderStatus', callback),
    onFolderAvailability: (
      callback: (payload: EventPayloadByKey['folderAvailabilityChanged']) => void,
    ) => on('folderAvailabilityChanged', callback),
  } as SortieAPI;
  vi.stubGlobal('window', { sortieAPI: api });
  return {
    api,
    emit<K extends EventKey>(key: K, payload: EventPayloadByKey[K]) {
      subscribers.get(key)?.forEach((callback) => callback(payload as never));
    },
  };
}
