import chokidar from 'chokidar';
import { DatabaseService } from './database';
import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

export class WatcherService {
  private watchers: Map<string, chokidar.FSWatcher> = new Map();
  private dbService: DatabaseService | null = null;

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
        pollInterval: 100
      }
    });

    watcher
      .on('add', (filePath) => this.onFileAdded(filePath))
      .on('unlink', (filePath) => this.onFileRemoved(filePath))
      .on('error', (error) => console.error('Watcher error:', error));

    this.watchers.set(folderPath, watcher);
  }

  stopWatching(folderPath: string) {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
    }
  }

  stopAll() {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();
  }

  private async onFileAdded(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) && this.dbService) {
      try {
        await this.dbService.addImage(filePath);
      } catch (error) {
        console.error('Failed to process image:', filePath, error);
      }
    }
  }

  private async onFileRemoved(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) && this.dbService) {
      try {
        await this.dbService.markImageMissing(filePath);
      } catch (error) {
        console.error('Failed to mark image as missing:', filePath, error);
      }
    }
  }
}
