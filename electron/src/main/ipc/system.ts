import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import { cancelOperation } from '../operations';
import type { MainIpcContext } from './context';

const IMAGE_EXTENSIONS = new Set<string>(SUPPORTED_IMAGE_EXTENSIONS);

async function countImagesRecursive(root: string, cap: number): Promise<number> {
  let count = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      count++;
      if (count >= cap) return count;
    }
  }

  return count;
}

export function registerSystemHandlers({
  dbService,
  availabilityMonitor,
  dbPath,
}: MainIpcContext): void {
  ipcMain.handle('pick-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('cancel-operation', async (_event, { opId }: { opId: string }) => {
    return { cancelled: cancelOperation(opId) };
  });

  ipcMain.handle('settings:get', (_event, { key }: { key: string }) => {
    return dbService.getSetting(key);
  });

  ipcMain.handle('settings:set', (_event, { key, value }: { key: string; value: string }) => {
    dbService.setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle('suggest-default-photo-folder', async () => {
    const picturesPath = app.getPath('pictures');
    let exists = false;
    let approxImageCount: number | null = null;
    let capped = false;

    try {
      const stat = await fs.promises.stat(picturesPath);
      if (stat.isDirectory()) {
        exists = true;
        const cap = 100_000;
        try {
          approxImageCount = await countImagesRecursive(picturesPath, cap);
          capped = approxImageCount >= cap;
        } catch {
          // Best-effort only.
        }
      }
    } catch {
      // Pictures directory may not exist.
    }

    return { path: picturesPath, exists, approxImageCount, capped };
  });

  ipcMain.handle('recheck-folder-availability', async (_event, args?: { path?: string }) => {
    const changes = await availabilityMonitor.checkNow(args?.path);
    return { changes };
  });

  ipcMain.handle('get-database-path', async () => {
    return dbPath;
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:showAboutPanel', () => {
    app.showAboutPanel();
  });

  ipcMain.handle('app:openExternal', async (_event, { url }: { url: string }) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Refusing to open non-http(s) URL: ${url}`);
    }
    await shell.openExternal(url);
    return { success: true };
  });
}
