import {
  type ClipEmbedder,
  computeFileHash,
  type DatabaseManager,
  extractExif,
  extractPalette,
  type FaceScanService,
  type SuggestionEngine,
  loadImageInput,
  runWithConcurrency,
} from 'pipeline';
import type { Folder, Image, LinkPreview, Tag, TagSuggestion } from 'shared';
import { fetchLinkPreview, hashUrl } from '../linkPreview';
import { MIME_TYPES } from '../database-helpers';
import fs from 'fs/promises';
import path from 'path';

interface DatabaseImagesDeps {
  requireDb(): DatabaseManager;
  getEmbedder(): ClipEmbedder;
  getFaceScan(): FaceScanService;
  getSuggestionEngine(): SuggestionEngine;
  getFolderForPath(filePath: string): Folder | null;
}

export interface AddImageOptions {
  invalidateCache?: boolean;
}

export interface AddImageResult {
  imageId: number;
  skipped: boolean;
}

export class DatabaseImagesService {
  private readonly imageCache = new Map<string, Image[]>();
  private readonly shuffledIdCache = new Map<string, number[]>();

  constructor(private readonly deps: DatabaseImagesDeps) {}

  private shuffleInPlace<T>(items: T[]): void {
    for (let index = items.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
  }

  getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[] {
    const cached = this.shuffledIdCache.get(cacheKey);
    if (cached) return cached;

    const ids = loadIds();
    this.shuffleInPlace(ids);
    this.shuffledIdCache.set(cacheKey, ids);
    return ids;
  }

  deleteShuffledIds(prefixOrKey: string, exact: boolean = false): void {
    if (exact) {
      this.shuffledIdCache.delete(prefixOrKey);
      return;
    }

    for (const key of Array.from(this.shuffledIdCache.keys())) {
      if (key.startsWith(prefixOrKey)) {
        this.shuffledIdCache.delete(key);
      }
    }
  }

  fetchImagesByIdsInOrder(ids: number[]): Image[] {
    return this.deps.requireDb().images.getImagesByIds(ids);
  }

  async getSuggestions(imageId: number): Promise<TagSuggestion[]> {
    return this.deps.getSuggestionEngine().generateSuggestionsForImage(imageId);
  }

  async dismissSuggestion(imageId: number, tagId: number): Promise<void> {
    this.deps.getSuggestionEngine().dismissSuggestion(imageId, tagId);
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    const db = this.deps.requireDb();
    const cacheKey = `images:${limit}:${offset}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) return cached;

    const allIds = this.getOrBuildShuffledIds('default', () => db.images.getVisibleImageIds());
    const pageIds = allIds.slice(offset, offset + limit);
    const images = this.fetchImagesByIdsInOrder(pageIds);
    this.imageCache.set(cacheKey, images);
    return images;
  }

  async getImage(id: number): Promise<Image | null> {
    return this.deps.requireDb().images.getImageById(id);
  }

  getImageIdByPath(filePath: string): number | null {
    return this.deps.requireDb().images.getImageIdByPath(filePath);
  }

  isKnownImagePath(filePath: string): boolean {
    return this.deps.requireDb().images.getImageScanState(filePath) !== null;
  }

  invalidateImageCache(): void {
    this.imageCache.clear();
    this.shuffledIdCache.clear();
  }

  invalidateMetadataCaches(): void {
    this.imageCache.clear();
    for (const key of Array.from(this.shuffledIdCache.keys())) {
      if (key !== 'default') {
        this.shuffledIdCache.delete(key);
      }
    }
  }

  reshuffle(): void {
    this.invalidateImageCache();
  }

  async hideImage(imageId: number): Promise<void> {
    this.deps.requireDb().folders.setImageHidden(imageId);
    this.invalidateImageCache();
  }

  async updateImageTags(imageId: number, tagNames: string[]): Promise<void> {
    this.deps.requireDb().tags.setUserTags(imageId, tagNames);
    this.invalidateMetadataCaches();
  }

  async updateImageMetadata(
    imageId: number,
    metadata: {
      description?: string;
      favorite?: boolean;
      captured_at?: string | null;
      city?: string | null;
      country?: string | null;
      website_link?: string | null;
    },
  ): Promise<void> {
    this.deps.requireDb().images.updateImageMetadata(imageId, metadata);
    this.invalidateMetadataCaches();
  }

  async getLinkPreview(url: string): Promise<LinkPreview | null> {
    return this.deps.requireDb().images.getLinkPreview(hashUrl(url));
  }

  async fetchAndCacheLinkPreview(url: string): Promise<LinkPreview> {
    const preview = await fetchLinkPreview(url);
    this.deps.requireDb().images.saveLinkPreview(hashUrl(preview.url), preview);
    return preview;
  }

  async getAllTags(): Promise<Tag[]> {
    return this.deps.requireDb().tags.getAllTags() as Tag[];
  }

  async getTagsWithCounts(): Promise<Array<Tag & { usage_count: number }>> {
    return this.deps.requireDb().tags.getTagsWithCounts() as Array<Tag & { usage_count: number }>;
  }

  private isUnchangedScanComplete(
    state: ReturnType<DatabaseManager['images']['getImageScanState']>,
    stats: Awaited<ReturnType<typeof fs.stat>>,
    faceScanExcluded: boolean,
  ): state is NonNullable<typeof state> {
    if (!state) return false;
    if (state.file_size !== Number(stats.size)) return false;
    if (state.file_mtime_ms === null) return false;
    if (Math.abs(state.file_mtime_ms - Number(stats.mtimeMs)) > 1) return false;

    return (
      state.file_hash !== null &&
      !!state.embedded &&
      state.palette_json !== null &&
      (faceScanExcluded || !!state.faces_scanned)
    );
  }

  async addImage(filePath: string, options: AddImageOptions = {}): Promise<AddImageResult> {
    const db = this.deps.requireDb();
    const embedder = this.deps.getEmbedder();
    const normalizedPath = path.resolve(filePath);
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
    const folder = this.deps.getFolderForPath(filePath);
    const existingState = db.images.getImageScanState(normalizedPath);
    if (this.isUnchangedScanComplete(existingState, stats, !!folder?.exclude_from_face_scan)) {
      db.images.clearMissingFlag(existingState.id);
      return { imageId: existingState.id, skipped: true };
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || null;
    const loaded = await loadImageInput(filePath);

    const [exifData, fileHash] = await Promise.all([
      extractExif(filePath, loaded),
      computeFileHash(filePath),
    ]);

    const imageData: Omit<Image, 'id' | 'created_at' | 'modified_at'> = {
      file_path: normalizedPath,
      file_name: fileName,
      file_size: Number(stats.size),
      file_mtime_ms: Number(stats.mtimeMs),
      mime_type: mimeType,
      width: exifData.width,
      height: exifData.height,
      captured_at: exifData.capturedAt ? exifData.capturedAt.toISOString() : null,
      latitude: exifData.latitude,
      longitude: exifData.longitude,
      city: null,
      country: null,
      description: null,
      favorite: false,
      hidden: false,
      missing: false,
      camera_make: exifData.cameraMake,
      camera_model: exifData.cameraModel,
      aperture: exifData.aperture,
      iso: exifData.iso,
      exposure_time: exifData.exposureTime,
      focal_length: exifData.focalLength,
      file_hash: fileHash,
      dhash: null,
    };

    const { id: imageId, created, fileHashMatched } = db.images.upsertImage(imageData);
    if (!created && fileHashMatched) {
      if (options.invalidateCache !== false) {
        this.invalidateImageCache();
      }
      return { imageId, skipped: true };
    }

    const [embeddingResult, paletteResult] = await Promise.allSettled([
      embedder.embedImage(loaded),
      extractPalette(loaded),
    ]);

    if (embeddingResult.status === 'fulfilled') {
      try {
        db.vectors.insertEmbedding(imageId, embeddingResult.value);
      } catch (error) {
        console.error(`Failed to insert embedding for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to generate embedding for ${filePath}:`, embeddingResult.reason);
    }

    if (paletteResult.status === 'fulfilled') {
      try {
        db.palettes.insertPalette(imageId, paletteResult.value);
      } catch (error) {
        console.error(`Failed to insert palette for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to extract palette for ${filePath}:`, paletteResult.reason);
    }

    if (!folder?.exclude_from_face_scan) {
      try {
        const result = await this.deps.getFaceScan().processImage(imageId, filePath, loaded);
        for (const personId of result.personIds) {
          this.deleteShuffledIds(`person:${personId}`, true);
        }
      } catch (error) {
        console.error(`Failed face detection for ${filePath}:`, error);
      }
    }

    if (options.invalidateCache !== false) {
      this.invalidateImageCache();
    }
    return { imageId, skipped: false };
  }

  async recheckExternalImageAvailability(): Promise<{ changed: number }> {
    const db = this.deps.requireDb();
    const rows = db.images.listImagesOutsideAnyFolder();

    let changed = 0;
    await runWithConcurrency(rows, 16, async (row) => {
      const nextMissing = (await pathExists(row.file_path)) ? 0 : 1;
      if (row.missing !== nextMissing) {
        db.images.setMissingFlag(row.id, !!nextMissing);
        changed += 1;
      }
    });

    if (changed > 0) this.invalidateImageCache();
    return { changed };
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
