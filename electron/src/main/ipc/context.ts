import { ipcMain, type IpcMainInvokeEvent } from 'electron';
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

type InvokeHandler<K extends InvokeKey> = (
  event: IpcMainInvokeEvent,
  args: InvokeArgsByKey[K],
) => Promise<InvokeResultByKey[K]> | InvokeResultByKey[K];

type AnyInvokeHandler = (event: IpcMainInvokeEvent, args: unknown) => unknown;
const invokeHandlers = new Map<string, AnyInvokeHandler>();

// Registered before services exist; calls wait for servicesReady.
export function installInvokeDispatchers(servicesReady: Promise<void>): void {
  for (const channel of Object.values(IPC_INVOKE_CHANNELS)) {
    ipcMain.handle(channel, async (event, args: unknown) => {
      await servicesReady;
      return await invokeHandlers.get(channel)!(event, args);
    });
  }
}

export function handleInvoke<K extends InvokeKey>(key: K, handler: InvokeHandler<K>): void {
  invokeHandlers.set(IPC_INVOKE_CHANNELS[key], handler as AnyInvokeHandler);
}
