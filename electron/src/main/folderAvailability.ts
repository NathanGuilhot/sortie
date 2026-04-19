import { BrowserWindow } from 'electron';
import fs from 'fs/promises';
import { DatabaseService } from './database';

export interface FolderAvailabilityChange {
  path: string;
  available: boolean;
  writable: boolean;
}

export class FolderAvailabilityMonitor {
  private dbService: DatabaseService;
  private intervalHandle: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  start(intervalMs: number = 5000) {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async checkNow(folderPath?: string): Promise<FolderAvailabilityChange[]> {
    return this.tick(folderPath);
  }

  private async tick(onlyPath?: string): Promise<FolderAvailabilityChange[]> {
    if (this.inFlight) return [];
    this.inFlight = true;
    const changes: FolderAvailabilityChange[] = [];
    try {
      const folders = await this.dbService.getFolders();
      const targets = onlyPath ? folders.filter((f) => f.path === onlyPath) : folders;
      for (const folder of targets) {
        const { available, writable } = await this.probe(folder.path);
        const result = await this.dbService.setFolderAvailability(
          folder.path,
          available,
          writable,
        );
        if (result.changed) {
          const change: FolderAvailabilityChange = { path: folder.path, available, writable };
          changes.push(change);
          this.broadcast(change);
        }
      }
    } catch (err) {
      console.error('[availability] tick failed:', err);
    } finally {
      this.inFlight = false;
    }
    return changes;
  }

  private async probe(folderPath: string): Promise<{ available: boolean; writable: boolean }> {
    try {
      const stat = await fs.stat(folderPath);
      if (!stat.isDirectory()) return { available: false, writable: false };
      let writable = true;
      try {
        await fs.access(folderPath, fs.constants.W_OK);
      } catch {
        writable = false;
      }
      return { available: true, writable };
    } catch {
      return { available: false, writable: false };
    }
  }

  private broadcast(change: FolderAvailabilityChange) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('folder-availability-changed', change);
    }
  }
}
