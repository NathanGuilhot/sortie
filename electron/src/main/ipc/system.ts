import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import { cancelOperation } from '../operations';
import type { MainIpcContext } from './context';
import { handleInvoke } from './context';
import { showDirectoryPicker } from './directoryPicker';

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
  handleInvoke('pickFolder', async (event) => {
    return await showDirectoryPicker(event);
  });

  handleInvoke('cancelOperation', async (_event, { opId }) => {
    return { cancelled: cancelOperation(opId) };
  });

  handleInvoke('settingsGet', (_event, { key }) => {
    return dbService.getSetting(key);
  });

  handleInvoke('settingsSet', (_event, { key, value }) => {
    dbService.setSetting(key, value);
    return { success: true };
  });

  handleInvoke('suggestDefaultPhotoFolder', async () => {
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

  handleInvoke('recheckFolderAvailability', async (_event, args) => {
    const changes = await availabilityMonitor.checkNow(args?.path);
    return { changes };
  });

  handleInvoke('getDatabasePath', async () => {
    return dbPath;
  });

  handleInvoke('appGetVersion', () => app.getVersion());

  handleInvoke('appShowAboutPanel', () => {
    app.showAboutPanel();
  });

  handleInvoke('appOpenExternal', async (_event, { url }) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Refusing to open non-http(s) URL: ${url}`);
    }
    await shell.openExternal(url);
    return { success: true };
  });
}
