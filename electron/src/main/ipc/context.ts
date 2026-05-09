import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  IPC_INVOKE_CHANNELS,
  type InvokeArgsByKey,
  type InvokeKey,
  type InvokeResultByKey,
} from 'shared';
import { clearOperation, registerOperation } from '../operations';
import type { DatabaseService } from '../database';
import type { FolderAvailabilityMonitor } from '../folderAvailability';
import type { WatcherService } from '../watcher';
import type { ExternalImportService } from '../externalImport';

export interface MainIpcContext {
  dbService: DatabaseService;
  watcherService: WatcherService;
  availabilityMonitor: FolderAvailabilityMonitor;
  dbPath: string;
  bulkImportJobs: Map<string, AbortController>;
  externalImportService: ExternalImportService;
}

export async function withOperation<T>(
  opId: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = registerOperation(opId);
  try {
    return await run(signal);
  } finally {
    clearOperation(opId);
  }
}

export function sendToRenderer<T>(sender: WebContents, channel: string): (payload: T) => void {
  return (payload) => {
    sender.send(channel, payload);
  };
}

type InvokeHandler<K extends InvokeKey> = (
  event: IpcMainInvokeEvent,
  args: InvokeArgsByKey[K],
) => Promise<InvokeResultByKey[K]> | InvokeResultByKey[K];

export function handleInvoke<K extends InvokeKey>(key: K, handler: InvokeHandler<K>): void {
  const channel = IPC_INVOKE_CHANNELS[key];
  ipcMain.handle(channel, async (event, args) => {
    return await handler(event, args as InvokeArgsByKey[K]);
  });
}
