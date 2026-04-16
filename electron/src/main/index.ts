import { app, BrowserWindow, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { setupIpcHandlers } from './ipc';

protocol.registerSchemesAsPrivileged([
  { scheme: 'sortie-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'sortie-thumb', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
]);

let mainWindow: BrowserWindow | null = null;
let dbService: DatabaseService | null = null;
let watcherService: WatcherService | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

async function initializeServices() {
  const dbPath = path.join(app.getPath('userData'), 'sortie.db');

  dbService = new DatabaseService();
  dbService.initialize(dbPath);

  watcherService = new WatcherService();
  watcherService.setDatabaseService(dbService);

  await dbService.fixImageDimensions();

  setupIpcHandlers(dbService, watcherService, dbPath);

  const folders = await dbService.getFolders();
  for (const folder of folders) {
    if (folder.watched) {
      watcherService.watchFolder(folder.path);
    }
  }
}

app.whenReady().then(async () => {
  const thumbDir = path.join(app.getPath('userData'), 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });

  protocol.handle('sortie-file', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname);
    return net.fetch(`file://${filePath}`);
  });

  protocol.handle('sortie-thumb', async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);
    const width = parseInt(url.searchParams.get('w') || '400', 10);

    const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
    const cachePath = path.join(thumbDir, `${hash}_${width}.jpg`);

    try {
      const srcStat = fs.statSync(filePath);
      let useCached = false;
      try {
        const cacheStat = fs.statSync(cachePath);
        useCached = cacheStat.mtimeMs >= srcStat.mtimeMs;
      } catch {}

      if (!useCached) {
        console.log(`[thumb] generating ${width}px thumbnail for ${path.basename(filePath)}`);
        await sharp(filePath)
          .rotate()
          .resize(width, null, { withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(cachePath);
      }

      return net.fetch(`file://${cachePath}`);
    } catch (err) {
      console.error('[thumb] failed:', err);
      return net.fetch(`file://${filePath}`);
    }
  });

  await initializeServices();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  watcherService?.stopAll();
  dbService?.close();
});
