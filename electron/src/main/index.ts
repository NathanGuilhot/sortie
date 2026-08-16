import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { shutdownRawLoader } from 'pipeline';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { FolderAvailabilityMonitor } from './folderAvailability';
import { setupIpcHandlers } from './ipc';
import { emitToRenderer } from './ipc/events';
import {
  ExternalImportService,
  parseExternalImportArgs,
  type ExternalImportInvocation,
} from './externalImport';
import { buildMenu } from './menu';
import { ensureImportFolder } from './pinterest/import';
import { registerSortieProtocols, registerSortieSchemes } from './protocols';
import { getAppIconPath } from './appIcon';
import { createProtocolPathGuard } from './protocol-guard';
import { registerExternalImportEntrypoints } from './shellContextMenu';
import { getSortieUserDataPaths } from './userDataPaths';

app.setName('Sortie');

const iconPath = getAppIconPath();

registerSortieSchemes();

let mainWindow: BrowserWindow | null = null;
let dbService: DatabaseService | null = null;
let watcherService: WatcherService | null = null;
let availabilityMonitor: FolderAvailabilityMonitor | null = null;
let externalImportService: ExternalImportService | null = null;
let hasRunQuitCleanup = false;
let quitCleanupPromise: Promise<void> | null = null;
let provenanceBackfillStarted = false;
const pendingExternalImports: ExternalImportInvocation[] = [];

const initialExternalImport = parseExternalImportArgs(process.argv);
if (initialExternalImport) {
  pendingExternalImports.push(initialExternalImport);
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  const invocation = parseExternalImportArgs(argv);
  if (invocation) {
    queueExternalImport(invocation);
  }

  if (!mainWindow && externalImportService) {
    createWindow();
  } else if (mainWindow) {
    showMainWindow();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  const invocation = parseExternalImportArgs([url]);
  if (invocation) queueExternalImport(invocation);
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueExternalImport({ action: 'add-images-to-gallery', paths: [filePath] });
});

function queueExternalImport(invocation: ExternalImportInvocation): void {
  pendingExternalImports.push(invocation);
  if (externalImportService && !mainWindow && app.isReady()) {
    createWindow();
  }
  flushExternalImports();
}

function flushExternalImports(): void {
  if (!externalImportService || !mainWindow || mainWindow.webContents.isLoading()) return;
  while (pendingExternalImports.length > 0) {
    const invocation = pendingExternalImports.shift()!;
    void externalImportService.run(invocation).catch((error) => {
      console.error('[external-import] failed:', error);
    });
  }
}

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function cleanupBeforeQuit(): Promise<void> {
  if (quitCleanupPromise) return quitCleanupPromise;

  quitCleanupPromise = (async () => {
    availabilityMonitor?.stop();
    watcherService?.stopAll();
    await dbService?.close();
    await shutdownRawLoader();
  })();

  return quitCleanupPromise;
}

function migrateLegacyClipCache(targetDir: string) {
  try {
    const legacyDir = path.join(
      path.dirname(require.resolve('@xenova/transformers/package.json')),
      '.cache',
    );
    if (!fs.existsSync(legacyDir)) return;
    const entries = fs.readdirSync(legacyDir);
    for (const entry of entries) {
      const src = path.join(legacyDir, entry);
      const dst = path.join(targetDir, entry);
      if (fs.existsSync(dst)) continue;
      fs.cpSync(src, dst, { recursive: true });
    }
  } catch (error) {
    console.warn('Legacy CLIP cache migration skipped:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sortie',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    // Chromium's DevTools probes Autofill protocol commands that Electron's
    // bundled Chromium build doesn't implement, producing noisy console errors
    // every devtools open. Drop those two specific messages.
    mainWindow.webContents.on('console-message', (event, _level, message) => {
      if (
        message.includes("'Autofill.enable' wasn't found") ||
        message.includes("'Autofill.setAddresses' wasn't found")
      ) {
        event.preventDefault();
      }
    });
  }

  mainWindow.webContents.once('did-stop-loading', () => setImmediate(flushExternalImports));
  mainWindow.webContents.once('did-finish-load', () => {
    void startBackgroundProvenanceBackfill();
  });

  if (process.env.NODE_ENV === 'development') {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

async function startBackgroundProvenanceBackfill(): Promise<void> {
  if (provenanceBackfillStarted || !dbService) return;
  provenanceBackfillStarted = true;
  const service = dbService;
  try {
    const result = await service.maintenance.backfillProvenance();
    if (result.filled > 0) {
      console.log(`[provenance] recovered origins for ${result.filled} images`);
    }
    emitToRenderer(mainWindow, 'originBackfillComplete', { filled: result.filled });
  } catch (err) {
    console.warn('[provenance] backfill failed:', err);
  }
}

async function initializeServices() {
  const userDataPaths = getSortieUserDataPaths(app.getPath('userData'));
  const dbPath = userDataPaths.database;

  const faceModelsPath = path.join(
    path.dirname(require.resolve('@vladmandic/face-api/package.json')),
    'model',
  );

  const thumbDir = userDataPaths.thumbs;
  const clipCacheDir = userDataPaths.models;
  fs.mkdirSync(clipCacheDir, { recursive: true });
  migrateLegacyClipCache(clipCacheDir);

  const ocrModelsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'models', 'ocr')
    : path.join(__dirname, '../../resources/models/ocr');
  const ocrAvailable = fs.existsSync(path.join(ocrModelsPath, 'recognition.onnx'));
  if (!ocrAvailable) {
    console.warn('[ocr] models not found at', ocrModelsPath, '- run yarn fetch:ocr-models');
  }

  dbService = new DatabaseService();
  dbService.initialize(
    dbPath,
    faceModelsPath,
    thumbDir,
    clipCacheDir,
    ocrAvailable ? ocrModelsPath : undefined,
  );

  watcherService = new WatcherService();
  watcherService.setDatabaseService(dbService);

  availabilityMonitor = new FolderAvailabilityMonitor(dbService);
  externalImportService = new ExternalImportService({
    dbService,
    watcherService,
    availabilityMonitor,
    getWindow: () => mainWindow,
  });

  await dbService.runStartupMaintenance();

  setupIpcHandlers(dbService, watcherService, availabilityMonitor, externalImportService, dbPath);

  dbService.onEmbedderStatus((status) => {
    emitToRenderer(mainWindow, 'embedderStatus', status);
  });
  void dbService.warmupEmbedder();

  dbService.ocr.onUpdate((payload) => {
    emitToRenderer(mainWindow, 'ocrUpdated', payload);
  });

  // Pre-create the Pinterest import folder so it's listed in /folders even
  // before the user imports anything. NEVER add it to the watcher: the
  // importer calls addImage explicitly.
  try {
    await ensureImportFolder(dbService);
  } catch (err) {
    console.warn('[boot] failed to ensure pinterest import folder:', err);
  }

  const folders = await dbService.folders.getFolders();
  for (const folder of folders) {
    if (folder.watched) {
      void watcherService.watchFolder(folder.path);
    }
  }

  availabilityMonitor.start();

  // Background palette backfill for libraries that predate this feature.
  // Runs silently; new images get palettes during addImage.
  const service = dbService;
  void (async () => {
    try {
      const result = await service.maintenance.computeMissingPalettes();
      if (result.computed > 0) {
        console.log(`[palette] backfilled ${result.computed} images`);
      }
    } catch (err) {
      console.warn('[palette] backfill failed:', err);
    }
  })();
}

void app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    try {
      app.dock?.setIcon(iconPath);
    } catch (error) {
      console.warn('Dock icon load failed:', error);
    }
  }
  registerSortieProtocols(
    app.getPath('userData'),
    createProtocolPathGuard({
      allowedRoots: [app.getPath('userData')],
      getLibraryFolderPaths: async () => {
        if (!dbService) throw new Error('database not ready');
        const folders = await dbService.folders.getFolders();
        return folders.map((folder) => folder.path);
      },
      isKnownImagePath: (requestedPath) => {
        return dbService?.images.isKnownImagePath(requestedPath) ?? false;
      },
    }),
  );
  await registerExternalImportEntrypoints();

  try {
    app.setAboutPanelOptions({
      applicationName: 'Sortie',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} Nathan Guilhot`,
      website: 'https://github.com/nathanguilhot/sortie',
      iconPath: iconPath,
    });
  } catch (error) {
    console.warn('About panel options failed:', error);
  }

  await initializeServices();
  createWindow();
  void dbService?.images
    .recheckExternalImageAvailability()
    .then(({ changed }) => {
      if (changed > 0) {
        console.log(`[maintenance] updated availability for ${changed} external images`);
      }
    })
    .catch((error) => {
      console.warn('[maintenance] external image availability check failed:', error);
    });
  Menu.setApplicationMenu(buildMenu(mainWindow));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('browser-window-focus', () => {
    void availabilityMonitor?.checkNow();
    void dbService?.images.recheckExternalImageAvailability();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    //We don't want the app to hang in the dock on mac, doesn't make sense
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (hasRunQuitCleanup) return;

  event.preventDefault();
  void cleanupBeforeQuit()
    .catch((error) => {
      console.error('[shutdown] cleanup failed:', error);
    })
    .finally(() => {
      hasRunQuitCleanup = true;
      app.quit();
    });
});
