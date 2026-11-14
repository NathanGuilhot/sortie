import { DatabaseManager, ClipEmbedder, SuggestionEngine } from 'pipeline';
import { EmbedderStatus, type AppSettingKey } from 'shared';
import { DatabaseOcrService } from './database-ocr';
import { DatabaseBoardsService } from './database/boards';
import { DatabaseFoldersService } from './database/folders';
import { DatabaseImagesService } from './database/images';
import { DatabaseMaintenanceService } from './database/maintenance';
import { DatabaseSearchService } from './database/search';
import { DatabaseDuplicateService } from './database/duplicates';
import { shell } from 'electron';

export class DatabaseService {
  private db: DatabaseManager | null = null;
  private embedder: ClipEmbedder | null = null;
  private suggestionEngine: SuggestionEngine | null = null;
  private embedderStatus: EmbedderStatus = { state: 'idle' };
  private embedderStatusListeners = new Set<(status: EmbedderStatus) => void>();
  private ocrService: DatabaseOcrService | null = null;
  readonly duplicates = new DatabaseDuplicateService({
    requireDb: () => this.requireDb(),
    invalidateImageCache: () => this.images.invalidateImageCache(),
    trashItem: (filePath) => shell.trashItem(filePath),
  });
  readonly images = new DatabaseImagesService({
    requireDb: () => this.requireDb(),
    analysis: this.duplicates,
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    getSuggestionEngine: () => {
      if (!this.suggestionEngine) throw new Error('SuggestionEngine not initialized');
      return this.suggestionEngine;
    },
  });
  readonly search = new DatabaseSearchService({
    requireDb: () => this.requireDb(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    getOrBuildShuffledIds: (cacheKey, loadIds) =>
      this.images.getOrBuildShuffledIds(cacheKey, loadIds),
    fetchImagesByIdsInOrder: (ids) => this.images.fetchImagesByIdsInOrder(ids),
  });
  readonly boards = new DatabaseBoardsService({
    requireDb: () => this.requireDb(),
    fetchImagesByIdsInOrder: (ids) => this.images.fetchImagesByIdsInOrder(ids),
    invalidateMetadataCaches: () => this.images.invalidateMetadataCaches(),
    getSuggestionEngine: () => {
      if (!this.suggestionEngine) throw new Error('SuggestionEngine not initialized');
      return this.suggestionEngine;
    },
  });
  readonly folders = new DatabaseFoldersService({
    requireDb: () => this.requireDb(),
    addImage: (filePath, options) => this.images.addImage(filePath, options),
    invalidateImageCache: () => this.images.invalidateImageCache(),
  });
  readonly maintenance = new DatabaseMaintenanceService({
    requireDb: () => this.requireDb(),
    invalidateImageCache: () => this.images.invalidateImageCache(),
    getEmbedder: () => {
      if (!this.embedder) throw new Error('Embedder not initialized');
      return this.embedder;
    },
    createFileDeletionError: (filePath, code, cause) =>
      new FileDeletionError(filePath, code, cause),
  });

  initialize(dbPath: string, clipCacheDir?: string, ocrModelsPath?: string) {
    this.db = new DatabaseManager(dbPath);
    this.embedder = new ClipEmbedder(clipCacheDir);
    this.suggestionEngine = new SuggestionEngine(this.db);
    this.ocrService = new DatabaseOcrService(this.db, ocrModelsPath);
  }

  async runStartupMaintenance(): Promise<void> {
    if (!this.db) return;
    await this.duplicates.recover();
    const result = await this.db.runStartupMaintenance();
    if (result.fixedImageDimensions > 0) {
      this.images.invalidateImageCache();
      console.log(`[migration] fixed dimensions for ${result.fixedImageDimensions} images`);
    }
  }

  async warmupEmbedder(): Promise<void> {
    if (!this.embedder) return;
    if (this.embedderStatus.state === 'ready' || this.embedderStatus.state === 'warming') return;
    this.setEmbedderStatus({ state: 'warming' });
    try {
      await this.embedder.initialize();
      this.setEmbedderStatus({ state: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('CLIP warmup failed:', error);
      this.setEmbedderStatus({ state: 'error', message });
    }
  }

  getEmbedderStatus(): EmbedderStatus {
    return this.embedderStatus;
  }

  onEmbedderStatus(listener: (status: EmbedderStatus) => void): () => void {
    this.embedderStatusListeners.add(listener);
    return () => {
      this.embedderStatusListeners.delete(listener);
    };
  }

  get ocr(): DatabaseOcrService {
    if (!this.ocrService) throw new Error('OCR service not initialized');
    return this.ocrService;
  }

  private setEmbedderStatus(status: EmbedderStatus) {
    this.embedderStatus = status;
    for (const listener of this.embedderStatusListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Embedder status listener failed:', error);
      }
    }
  }

  async close(): Promise<void> {
    await this.duplicates.close();
    await this.embedder?.dispose();
    this.db?.close();
    this.suggestionEngine?.close();
  }

  private requireDb(): DatabaseManager {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  getSetting(key: AppSettingKey): string | null {
    return this.requireDb().getSetting(key);
  }

  setSetting(key: AppSettingKey, value: string): void {
    this.requireDb().setSetting(key, value);
  }
}

export class FileDeletionError extends Error {
  readonly filePath: string;
  readonly code: string | undefined;

  constructor(filePath: string, code: string | undefined, cause: Error) {
    super(`[${code ?? 'EUNKNOWN'}] ${describeFsErrorCode(code)}: ${filePath}`);
    this.name = 'FileDeletionError';
    this.filePath = filePath;
    this.code = code;
    (this as unknown as { cause?: unknown }).cause = cause;
  }
}

function describeFsErrorCode(code: string | undefined): string {
  switch (code) {
    case 'EROFS':
      return 'volume is read-only';
    case 'EACCES':
    case 'EPERM':
      return 'permission denied';
    case 'EBUSY':
      return 'file is in use';
    case 'ENOTEMPTY':
      return 'directory not empty';
    default:
      return 'could not delete file';
  }
}
