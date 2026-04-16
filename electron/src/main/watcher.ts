import chokidar from 'chokidar';
import { DatabaseService } from './database';
import path from 'path';

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
      .on('change', (filePath) => this.onFileChanged(filePath))
      .on('unlink', (filePath) => this.onFileRemoved(filePath))
      .on('error', (error) => console.error('Watcher error:', error));

    this.watchers.set(folderPath, watcher);
    console.log(`Watching folder: ${folderPath}`);
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
    console.log('File added:', filePath);
    // Check if it's an image file
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.heic'];
    if (imageExts.includes(ext)) {
      // Process image using pipeline
      if (this.dbService) {
        try {
          await this.dbService.addImage(filePath);
          console.log('Image processed and added to database:', filePath);
        } catch (error) {
          console.error('Failed to process image:', filePath, error);
        }
      } else {
        console.error('Database service not available');
      }
    }
  }

  private onFileChanged(filePath: string) {
    console.log('File changed:', filePath);
  }

  private async onFileRemoved(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.heic'];
    if (imageExts.includes(ext) && this.dbService) {
      try {
        await this.dbService.markImageMissing(filePath);
      } catch (error) {
        console.error('Failed to mark image as missing:', filePath, error);
      }
    }
  }
}