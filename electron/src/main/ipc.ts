import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { FolderAvailabilityMonitor } from './folderAvailability';
import { registerBoardHandlers } from './ipc/boards';
import { registerFolderHandlers } from './ipc/folders';
import { registerExternalImportHandlers } from './ipc/externalImport';
import { registerImageHandlers } from './ipc/images';
import { registerMaintenanceHandlers } from './ipc/maintenance';
import { registerOcrHandlers } from './ipc/ocr';
import { registerPeopleHandlers } from './ipc/people';
import { registerPinterestHandlers } from './ipc/pinterest';
import { registerSystemHandlers } from './ipc/system';
import type { ExternalImportService } from './externalImport';

export function setupIpcHandlers(
  dbService: DatabaseService,
  watcherService: WatcherService,
  availabilityMonitor: FolderAvailabilityMonitor,
  externalImportService: ExternalImportService,
  dbPath: string,
) {
  const context = {
    dbService,
    watcherService,
    availabilityMonitor,
    dbPath,
    bulkImportJobs: new Map<string, AbortController>(),
    externalImportService,
  };

  registerSystemHandlers(context);
  registerFolderHandlers(context);
  registerExternalImportHandlers(context);
  registerImageHandlers(context);
  registerBoardHandlers(context);
  registerPeopleHandlers(context);
  registerMaintenanceHandlers(context);
  registerPinterestHandlers(context);
  registerOcrHandlers(context);
}
