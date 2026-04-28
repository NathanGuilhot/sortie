import { ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC_INVOKE_CHANNELS,
  type InvokeArgsByKey,
  type InvokeKey,
  type InvokeResultByKey,
} from 'shared';

export function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

export function invoke<K extends InvokeKey>(
  key: K,
  args: InvokeArgsByKey[K],
): Promise<InvokeResultByKey[K]> {
  return ipcRenderer.invoke(IPC_INVOKE_CHANNELS[key], args) as Promise<InvokeResultByKey[K]>;
}

export function invokeNone<K extends InvokeKey>(key: K): Promise<InvokeResultByKey[K]> {
  return invoke(key, undefined as InvokeArgsByKey[K]);
}

export function invokeWithImageId<K extends InvokeKey>(
  key: K,
  imageId: number,
): Promise<InvokeResultByKey[K]> {
  return invoke(key, { imageId } as InvokeArgsByKey[K]);
}

export function invokeWithPath<K extends InvokeKey>(
  key: K,
  path: string,
): Promise<InvokeResultByKey[K]> {
  return invoke(key, { path } as InvokeArgsByKey[K]);
}

export function invokeWithOpId<K extends InvokeKey>(
  key: K,
  opId: string,
): Promise<InvokeResultByKey[K]> {
  return invoke(key, { opId } as InvokeArgsByKey[K]);
}

export function invokeWithTagId<K extends InvokeKey>(
  key: K,
  tagId: number,
): Promise<InvokeResultByKey[K]> {
  return invoke(key, { tagId } as InvokeArgsByKey[K]);
}

export function invokeWithUrl<K extends InvokeKey>(
  key: K,
  url: string,
): Promise<InvokeResultByKey[K]> {
  return invoke(key, { url } as InvokeArgsByKey[K]);
}
