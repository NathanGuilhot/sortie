import { app, BrowserWindow, Menu, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { FolderAvailabilityMonitor } from './folderAvailability';
import { setupIpcHandlers } from './ipc';
import { buildMenu } from './menu';

app.setName('Sortie');

const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icons', 'icon.png')
  : path.join(__dirname, '../../resources/icons/icon.png');

protocol.registerSchemesAsPrivileged([
  { scheme: 'sortie-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'sortie-thumb', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  { scheme: 'sortie-face', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
  {
    scheme: 'sortie-preview',
    privileges: { bypassCSP: true, supportFetchAPI: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let dbService: DatabaseService | null = null;
let watcherService: WatcherService | null = null;
let availabilityMonitor: FolderAvailabilityMonitor | null = null;

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
  const clipCacheDir = path.join(app.getPath('userData'), 'models');
  fs.mkdirSync(clipCacheDir, { recursive: true });
  migrateLegacyClipCache(clipCacheDir);

  dbService = new DatabaseService();
  dbService.initialize(dbPath, faceModelsPath, thumbDir, clipCacheDir);

  watcherService = new WatcherService();
  watcherService.setDatabaseService(dbService);

  availabilityMonitor = new FolderAvailabilityMonitor(dbService);

  await dbService.fixImageDimensions();

  setupIpcHandlers(dbService, watcherService, availabilityMonitor, dbPath);

  dbService.onEmbedderStatus((status) => {
    mainWindow?.webContents.send('embedder-status', status);
  });
  void dbService.warmupEmbedder();

  const folders = await dbService.getFolders();
  for (const folder of folders) {
    if (folder.watched) {
      void watcherService.watchFolder(folder.path);
    }
  }

  availabilityMonitor.start();
}

void app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    try {
      app.dock?.setIcon(iconPath);
    } catch (error) {
      console.warn('Dock icon load failed:', error);
    }
  }

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

    let srcStat: fs.Stats;
    try {
      srcStat = fs.statSync(filePath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EIO') {
        // Fall back to cached thumbnail if we have one — useful when the
        // source drive is offline but a thumbnail was generated previously.
        if (fs.existsSync(cachePath)) {
          return net.fetch(`file://${cachePath}`);
        }
        return new Response(null, { status: 410 });
      }
      console.error('[thumb] stat failed:', err);
      return new Response(null, { status: 500 });
    }

    try {
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
      if (fs.existsSync(cachePath)) {
        return net.fetch(`file://${cachePath}`);
      }
      return new Response(null, { status: 500 });
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

    // Cache key includes bbox so stale crops are never served after a
    // face-data reset (SQLite reuses row IDs without AUTOINCREMENT).
    const bboxKey = `${bx.toFixed(4)}_${by.toFixed(4)}_${bw.toFixed(4)}_${bh.toFixed(4)}`;
    const cacheHash = crypto
      .createHash('sha256')
      .update(`${faceId}_${bboxKey}_${filePath}`)
      .digest('hex')
      .slice(0, 16);
    const cachePath = path.join(faceThumbDir, `${cacheHash}_${size}.jpg`);

    try {
      if (fs.existsSync(cachePath)) {
        return net.fetch(`file://${cachePath}`);
      }

      try {
        fs.statSync(filePath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EIO') {
          return new Response(null, { status: 410 });
        }
        throw err;
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

  const previewDir = path.join(app.getPath('userData'), 'link-previews');
  fs.mkdirSync(previewDir, { recursive: true });

  protocol.handle('sortie-preview', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const filePath = path.join(previewDir, rel);
    if (!filePath.startsWith(previewDir)) return new Response(null, { status: 403 });
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
    return net.fetch(`file://${filePath}`);
  });

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
  Menu.setApplicationMenu(buildMenu(mainWindow));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('browser-window-focus', () => {
    void availabilityMonitor?.checkNow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  availabilityMonitor?.stop();
  watcherService?.stopAll();
  dbService?.close();
});
