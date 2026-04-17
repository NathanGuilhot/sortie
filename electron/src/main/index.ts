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
  { scheme: 'sortie-face', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
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
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

async function initializeServices() {
  const dbPath = path.join(app.getPath('userData'), 'sortie.db');

  const faceModelsPath = path.join(
    path.dirname(require.resolve('@vladmandic/face-api/package.json')),
    'model',
  );

  const thumbDir = path.join(app.getPath('userData'), 'thumbs');

  dbService = new DatabaseService();
  dbService.initialize(dbPath, faceModelsPath, thumbDir);

  watcherService = new WatcherService();
  watcherService.setDatabaseService(dbService);

  await dbService.fixImageDimensions();

  setupIpcHandlers(dbService, watcherService, dbPath);

  const folders = await dbService.getFolders();
  for (const folder of folders) {
    if (folder.watched) {
      void watcherService.watchFolder(folder.path);
    }
  }
}

void app.whenReady().then(async () => {
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
      } catch {
        // cache miss, will regenerate
      }

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

  const faceThumbDir = path.join(app.getPath('userData'), 'face-thumbs');
  fs.mkdirSync(faceThumbDir, { recursive: true });

  protocol.handle('sortie-face', async (request) => {
    const url = new URL(request.url);
    const faceId = url.hostname;
    const filePath = decodeURIComponent(url.searchParams.get('path') || '');
    const bx = parseFloat(url.searchParams.get('x') || '0');
    const by = parseFloat(url.searchParams.get('y') || '0');
    const bw = parseFloat(url.searchParams.get('w') || '0');
    const bh = parseFloat(url.searchParams.get('h') || '0');
    const size = parseInt(url.searchParams.get('size') || '200', 10);

    const cachePath = path.join(faceThumbDir, `${faceId}_${size}.jpg`);

    try {
      if (fs.existsSync(cachePath)) {
        return net.fetch(`file://${cachePath}`);
      }

      // metadata() returns raw stored dimensions; EXIF orientations 5-8
      // involve 90/270° rotation that swaps width and height.
      const meta = await sharp(filePath).metadata();
      const orientation = meta.orientation ?? 1;
      const swapDims = orientation >= 5 && orientation <= 8;
      const imgW = swapDims ? (meta.height ?? 1) : (meta.width ?? 1);
      const imgH = swapDims ? (meta.width ?? 1) : (meta.height ?? 1);

      // Expand bbox by 30% for better framing
      const pad = 0.3;
      const left = Math.max(0, Math.round((bx - bw * pad) * imgW));
      const top = Math.max(0, Math.round((by - bh * pad) * imgH));
      const right = Math.min(imgW, Math.round((bx + bw * (1 + pad)) * imgW));
      const bottom = Math.min(imgH, Math.round((by + bh * (1 + pad)) * imgH));
      const extractW = Math.max(1, right - left);
      const extractH = Math.max(1, bottom - top);

      await sharp(filePath)
        .rotate()
        .extract({ left, top, width: extractW, height: extractH })
        .resize(size, size, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toFile(cachePath);

      return net.fetch(`file://${cachePath}`);
    } catch (err) {
      console.error('[face-thumb] failed:', err);
      return new Response('Face thumbnail error', { status: 500 });
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
