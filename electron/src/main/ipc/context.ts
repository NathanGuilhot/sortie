import type { WebContents } from 'electron';
import { clearOperation, registerOperation } from '../operations';
import type { DatabaseService } from '../database';
import type { FolderAvailabilityMonitor } from '../folderAvailability';
import type { WatcherService } from '../watcher';

export interface MainIpcContext {
  dbService: DatabaseService;
  watcherService: WatcherService;
  availabilityMonitor: FolderAvailabilityMonitor;
  dbPath: string;
  bulkImportJobs: Map<string, AbortController>;
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
