import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { DatabaseService } from './database';
import { WatcherService } from './watcher';
import { setupIpcHandlers } from './ipc';

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
  // Database path in user data directory
  const dbPath = path.join(app.getPath('userData'), 'sortie.db');
  console.log('Database path:', dbPath);
  
  dbService = new DatabaseService();
  dbService.initialize(dbPath);
  
  watcherService = new WatcherService();
  watcherService.setDatabaseService(dbService);
  
  setupIpcHandlers(dbService, watcherService);
  
  // Start watching existing folders
  const folders = await dbService.getFolders();
  for (const folder of folders) {
    if (folder.watched) {
      watcherService.watchFolder(folder.path);
    }
  }
}

app.whenReady().then(async () => {
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
  // Cleanup
  watcherService?.stopAll();
  dbService?.close();
});