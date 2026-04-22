import chokidar from 'chokidar';
import { DatabaseService } from './database';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import path from 'path';
import { coalesceByPath } from './watcher-coalesce';

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

export class WatcherService {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private dbService: DatabaseService | null = null;
  private inflightAdds: Set<string> = new Set();
  private inflightRemoves: Set<string> = new Set();

  setDatabaseService(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  async watchFolder(folderPath: string) {
    if (this.watchers.has(folderPath)) {
      return;
    }
    const watcher = chokidar.watch(folderPath, {
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

    this.watchers.set(folderPath, watcher);
  }

  stopWatching(folderPath: string) {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      void watcher.close();
      this.watchers.delete(folderPath);
    }
  }

  stopAll() {
    this.watchers.forEach((watcher) => void watcher.close());
    this.watchers.clear();
  }

  private async onFileAdded(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext) || !this.dbService) return;
    const abs = path.resolve(filePath);
    const dbService = this.dbService;
    await coalesceByPath(this.inflightAdds, abs, async (p) => {
      try {
        await dbService.addImage(p);
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
    const folder = this.dbService.getFolderForPath(filePath);
    if (folder && !folder.available) return;
    const abs = path.resolve(filePath);
    const dbService = this.dbService;
    await coalesceByPath(this.inflightRemoves, abs, async (p) => {
      try {
        await dbService.markImageMissing(p);
      } catch (error) {
        console.error('Failed to mark image as missing:', p, error);
      }
    });
  }
}
