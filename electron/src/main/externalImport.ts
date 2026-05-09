import type { BrowserWindow } from 'electron';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { IPC_EVENTS, SUPPORTED_IMAGE_EXTENSIONS } from 'shared';
import type {
  ExternalBoardImportRequest,
  ExternalImportAction,
  ExternalImportComplete,
  ExternalImportProgress,
} from 'shared';
import { runWithConcurrency } from 'pipeline';
import type { DatabaseService } from './database';
import type { FolderAvailabilityMonitor } from './folderAvailability';
import type { WatcherService } from './watcher';

export interface ExternalImportInvocation {
  action: ExternalImportAction;
  paths: string[];
}

interface ExternalImportServiceDeps {
  dbService: DatabaseService;
  watcherService: WatcherService;
  availabilityMonitor: FolderAvailabilityMonitor;
  getWindow(): BrowserWindow | null;
}

const ACTION_ALIASES: Record<string, ExternalImportAction> = {
  'add-image-to-gallery': 'add-images-to-gallery',
  'add-folder-to-gallery': 'add-folders-to-gallery',
};

const VALID_ACTIONS: ReadonlySet<ExternalImportAction> = new Set([
  'add-images-to-gallery',
  'add-folders-to-gallery',
  'add-to-board',
]);

const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);
const IMPORT_CONCURRENCY = 3;

export function parseExternalImportArgs(argv: string[]): ExternalImportInvocation | null {
  let action: ExternalImportAction | null = null;
  const paths: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith('sortie://')) {
      const parsed = parseExternalImportUrl(arg);
      if (parsed) return parsed;
      continue;
    }

    if (arg.startsWith('--sortie-action=')) {
      action = parseAction(arg.slice('--sortie-action='.length));
      continue;
    }

    if (arg === '--sortie-action') {
      action = parseAction(argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (action && !arg.startsWith('--')) {
      paths.push(arg);
    }
  }

  if (!action || paths.length === 0) return null;
  return { action, paths };
}

function parseAction(value: string): ExternalImportAction | null {
  const normalized = value.trim().toLowerCase();
  if (normalized in ACTION_ALIASES) return ACTION_ALIASES[normalized];
  return VALID_ACTIONS.has(normalized as ExternalImportAction)
    ? (normalized as ExternalImportAction)
    : null;
}

function parseExternalImportUrl(value: string): ExternalImportInvocation | null {
  try {
    const url = new URL(value);
    const action = parseAction(url.searchParams.get('action') ?? '');
    if (!action) return null;
    const paths = url.searchParams.getAll('path').filter(Boolean);
    return paths.length > 0 ? { action, paths } : null;
  } catch {
    return null;
  }
}

function normalizePath(filePath: string): string {
  if (filePath.startsWith('file://')) {
    return decodeURIComponent(new URL(filePath).pathname);
  }
  return path.resolve(filePath);
}

function emitToWindow<T>(window: BrowserWindow | null, channel: string, payload: T): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

export class ExternalImportService {
  private readonly pendingBoardImports = new Map<string, ExternalBoardImportRequest>();

  constructor(private readonly deps: ExternalImportServiceDeps) {}

  getPendingBoardImport(): ExternalBoardImportRequest | null {
    return this.pendingBoardImports.values().next().value ?? null;
  }

  async addPendingImagesToBoard(jobId: string, tagId: number): Promise<void> {
    const request = this.pendingBoardImports.get(jobId);
    if (!request) throw new Error('Board import request is no longer available');
    await this.deps.dbService.boards.addImagesToBoard(request.imageIds, tagId);
    this.pendingBoardImports.delete(jobId);
    this.emitComplete({
      jobId,
      action: 'add-to-board',
      imported: request.imageIds.length,
      skipped: request.skipped,
      failed: request.failed,
    });
  }

  dismissPendingBoardImport(jobId: string): void {
    this.pendingBoardImports.delete(jobId);
  }

  async run(invocation: ExternalImportInvocation): Promise<void> {
    const jobId = crypto.randomUUID();
    const paths = Array.from(new Set(invocation.paths.map(normalizePath)));

    if (invocation.action === 'add-folders-to-gallery') {
      await this.importFoldersToGallery(jobId, paths);
      return;
    }

    const imagePaths = await collectImagePaths(paths, invocation.action === 'add-to-board');
    if (imagePaths.length === 0) {
      this.emitComplete({ jobId, action: invocation.action, imported: 0, skipped: 0, failed: 0 });
      return;
    }

    const result = await this.importImages(jobId, invocation.action, imagePaths);
    if (invocation.action === 'add-to-board' && result.imageIds.length > 0) {
      const request: ExternalBoardImportRequest = {
        jobId,
        imageIds: result.imageIds,
        imageCount: result.imageIds.length,
        skipped: result.skipped,
        failed: result.failed,
      };
      this.pendingBoardImports.set(jobId, request);
      emitToWindow(this.deps.getWindow(), IPC_EVENTS.externalImportBoardRequest, request);
      return;
    }

    this.emitComplete({
      jobId,
      action: invocation.action,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  private async importImages(
    jobId: string,
    action: ExternalImportAction,
    imagePaths: string[],
  ): Promise<{ imageIds: number[]; imported: number; skipped: number; failed: number }> {
    let completed = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const imageIds: number[] = [];

    this.emitProgress({
      jobId,
      action,
      current: 0,
      total: imagePaths.length,
      processed: imported,
      skipped,
      failed,
    });

    await runWithConcurrency(imagePaths, IMPORT_CONCURRENCY, async (filePath) => {
      try {
        const result = await this.deps.dbService.images.addImage(filePath, {
          invalidateCache: false,
        });
        imageIds.push(result.imageId);
        if (result.skipped) skipped += 1;
        else imported += 1;
      } catch (error) {
        failed += 1;
        console.error('[external-import] image import failed:', filePath, error);
      } finally {
        completed += 1;
        this.emitProgress({
          jobId,
          action,
          current: completed,
          total: imagePaths.length,
          currentPath: filePath,
          processed: imported,
          skipped,
          failed,
        });
      }
    });

    this.deps.dbService.images.invalidateImageCache();
    return { imageIds: Array.from(new Set(imageIds)), imported, skipped, failed };
  }

  private async importFoldersToGallery(jobId: string, paths: string[]): Promise<void> {
    const folders = await collectFolders(paths);
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    if (folders.length === 0) {
      this.emitComplete({ jobId, action: 'add-folders-to-gallery', imported, skipped, failed });
      return;
    }

    for (const folderPath of folders) {
      try {
        await this.deps.dbService.folders.addFolder(folderPath);
        await this.deps.watcherService.watchFolder(folderPath);
        void this.deps.availabilityMonitor.checkNow(folderPath);
        const result = await this.deps.dbService.folders.scanFolder(folderPath, (progress) => {
          this.emitProgress({
            jobId,
            action: 'add-folders-to-gallery',
            current: progress.current,
            total: progress.total,
            currentPath: progress.currentFile,
            processed: progress.processed ?? 0,
            skipped: progress.skipped ?? 0,
            failed,
          });
        });
        imported += result.processed;
        if (result.cancelled) skipped += 1;
      } catch (error) {
        failed += 1;
        console.error('[external-import] folder import failed:', folderPath, error);
      }
    }

    this.emitComplete({
      jobId,
      action: 'add-folders-to-gallery',
      imported,
      skipped,
      failed,
    });
  }

  private emitProgress(progress: ExternalImportProgress): void {
    emitToWindow(this.deps.getWindow(), IPC_EVENTS.externalImportProgress, progress);
  }

  private emitComplete(complete: ExternalImportComplete): void {
    emitToWindow(this.deps.getWindow(), IPC_EVENTS.externalImportComplete, complete);
  }
}

export async function collectImagePaths(
  paths: string[],
  includeFolders: boolean,
): Promise<string[]> {
  const imagePaths: string[] = [];
  for (const entryPath of paths) {
    await collectImagePath(entryPath, includeFolders, imagePaths);
  }
  return Array.from(new Set(imagePaths));
}

async function collectImagePath(
  entryPath: string,
  includeFolders: boolean,
  imagePaths: string[],
): Promise<void> {
  let stats;
  try {
    stats = await fs.stat(entryPath);
  } catch {
    return;
  }

  if (stats.isFile()) {
    if (IMAGE_EXTENSIONS.has(path.extname(entryPath).toLowerCase())) {
      imagePaths.push(entryPath);
    }
    return;
  }

  if (!includeFolders || !stats.isDirectory()) return;

  let entries;
  try {
    entries = await fs.readdir(entryPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    await collectImagePath(path.join(entryPath, entry.name), true, imagePaths);
  }
}

async function collectFolders(paths: string[]): Promise<string[]> {
  const folders: string[] = [];
  for (const entryPath of paths) {
    try {
      const stats = await fs.stat(entryPath);
      if (stats.isDirectory()) folders.push(entryPath);
    } catch {
      // Ignore unavailable selections.
    }
  }
  return Array.from(new Set(folders));
}
