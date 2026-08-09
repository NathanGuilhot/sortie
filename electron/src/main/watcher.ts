import chokidar from 'chokidar';
import { DatabaseService } from './database';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import path from 'path';
import type { Dirent } from 'fs';
import fs from 'fs/promises';
import { coalesceByPath } from './watcher-coalesce';

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);
const LINUX_POLL_INTERVAL_MS = 30_000;

export class WatcherService {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private linuxPollers: Map<string, NodeJS.Timeout> = new Map();
  private linuxSnapshots: Map<string, Set<string>> = new Map();
  private dbService: DatabaseService | null = null;
  private inflightAdds: Set<string> = new Set();
  private inflightRemoves: Set<string> = new Set();

  setDatabaseService(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  async watchFolder(folderPath: string) {
    const normalized = path.resolve(folderPath);
    if (this.watchers.has(normalized) || this.linuxPollers.has(normalized)) {
      return;
    }

    if (process.platform === 'linux') {
      await this.watchFolderByPolling(normalized);
      return;
    }

    const watcher = chokidar.watch(normalized, {
      ignored: /(^|[\\/\\\\])\\./,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    watcher
      .on('add', (filePath) => {
        void this.onFileAdded(filePath);
      })
      .on('unlink', (filePath) => {
        void this.onFileRemoved(filePath);
      })
      .on('error', (error) => console.error('Watcher error:', error));

    this.watchers.set(normalized, watcher);
  }

  stopWatching(folderPath: string) {
    const normalized = path.resolve(folderPath);
    const poller = this.linuxPollers.get(normalized);
    if (poller) {
      clearInterval(poller);
      this.linuxPollers.delete(normalized);
      this.linuxSnapshots.delete(normalized);
    }

    const watcher = this.watchers.get(normalized);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(normalized);
    }
  }

  stopAll() {
    this.linuxPollers.forEach((poller) => clearInterval(poller));
    this.linuxPollers.clear();
    this.linuxSnapshots.clear();
    this.watchers.forEach((watcher) => void watcher.close());
    this.watchers.clear();
  }

  private async watchFolderByPolling(folderPath: string) {
    const normalized = path.resolve(folderPath);
    this.linuxSnapshots.set(normalized, await this.collectImageFiles(normalized));

    const poller = setInterval(() => {
      void this.pollFolder(normalized);
    }, LINUX_POLL_INTERVAL_MS);
    poller.unref?.();

    this.linuxPollers.set(normalized, poller);
  }

  private async pollFolder(folderPath: string) {
    const previous = this.linuxSnapshots.get(folderPath);
    if (!previous) return;

    let current: Set<string>;
    try {
      current = await this.collectImageFiles(folderPath);
    } catch (error) {
      console.error('Watcher poll error:', error);
      return;
    }

    if (!this.linuxPollers.has(folderPath)) return;
    this.linuxSnapshots.set(folderPath, current);

    for (const filePath of current) {
      if (!previous.has(filePath)) {
        await this.onFileAdded(filePath);
      }
    }

    for (const filePath of previous) {
      if (!current.has(filePath)) {
        await this.onFileRemoved(filePath);
      }
    }
  }

  private async collectImageFiles(folderPath: string): Promise<Set<string>> {
    const files = new Set<string>();
    const pending = [folderPath];

    while (pending.length > 0) {
      const dir = pending.pop();
      if (!dir) continue;

      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        console.error('Watcher poll read error:', error);
        continue;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          pending.push(fullPath);
        } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          files.add(path.resolve(fullPath));
        }
      }
    }

    return files;
  }

  private async onFileAdded(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) || !this.dbService) return;
    const abs = path.resolve(filePath);
    const dbService = this.dbService;
    await coalesceByPath(this.inflightAdds, abs, async (p) => {
      try {
        await dbService.images.addImage(p);
      } catch (error) {
        console.error('Failed to process image:', p, error);
      }
    });
  }

  private async onFileRemoved(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) || !this.dbService) return;
    // Drive disconnects fire `unlink` for every file in the tree. The
    // availability monitor handles bulk mark-as-missing; ignore unlinks
    // when the parent folder is currently offline.
    const folder = this.dbService.folders.getFolderForPath(filePath);
    if (folder && !folder.available) return;
    const abs = path.resolve(filePath);
    const dbService = this.dbService;
    await coalesceByPath(this.inflightRemoves, abs, async (p) => {
      try {
        await dbService.folders.markImageMissing(p);
      } catch (error) {
        console.error('Failed to mark image as missing:', p, error);
      }
    });
  }
}
