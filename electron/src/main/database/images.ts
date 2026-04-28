import {
  type ClipEmbedder,
  computeFileHash,
  type DatabaseManager,
  extractExif,
  extractPalette,
  type FaceScanService,
  loadImageInput,
} from 'pipeline';
import type { Folder, Image, LinkPreview, Tag } from 'shared';
import { fetchLinkPreview, hashUrl } from '../linkPreview';
import { MIME_TYPES } from '../database-helpers';
import fs from 'fs/promises';
import path from 'path';

interface DatabaseImagesDeps {
  requireDb(): DatabaseManager;
  getEmbedder(): ClipEmbedder;
  getFaceScan(): FaceScanService;
  getFolderForPath(filePath: string): Folder | null;
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
    return this.deps.requireDb().getImagesByIds(ids);
  }

  async getImages(limit: number = 100, offset: number = 0): Promise<Image[]> {
    const db = this.deps.requireDb();
    const cacheKey = `images:${limit}:${offset}`;
    const cached = this.imageCache.get(cacheKey);
    if (cached) return cached;

    const allIds = this.getOrBuildShuffledIds('default', () => db.getVisibleImageIds());
    const pageIds = allIds.slice(offset, offset + limit);
    const images = this.fetchImagesByIdsInOrder(pageIds);
    this.imageCache.set(cacheKey, images);
    return images;
  }

  async getImage(id: number): Promise<Image | null> {
    return this.deps.requireDb().getImageById(id);
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
    this.deps.requireDb().setImageHidden(imageId);
    this.invalidateImageCache();
  }

  async updateImageTags(imageId: number, tagNames: string[]): Promise<void> {
    const db = this.deps.requireDb().getDatabase();

    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM image_tags WHERE image_id = ? AND source = 'user'`).run(imageId);

      const insertTag = db.prepare(
        `INSERT OR IGNORE INTO tags (name, category) VALUES (?, 'user')`,
      );
      const getTagId = db.prepare(`SELECT id FROM tags WHERE name = ?`);
      const nextPosition = db.prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM image_tags WHERE tag_id = ?`,
      );
      const linkTag = db.prepare(
        `INSERT OR IGNORE INTO image_tags (image_id, tag_id, source, position) VALUES (?, ?, 'user', ?)`,
      );

      for (const name of tagNames) {
        insertTag.run(name);
        const row = getTagId.get(name) as { id: number } | undefined;
        if (!row) continue;

        const { next } = nextPosition.get(row.id) as { next: number };
        linkTag.run(imageId, row.id, next);
      }
    });

    transaction();
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
    this.deps.requireDb().updateImageMetadata(imageId, metadata);
    this.invalidateMetadataCaches();
  }

  async getLinkPreview(url: string): Promise<LinkPreview | null> {
    return this.deps.requireDb().getLinkPreview(hashUrl(url));
  }

  async fetchAndCacheLinkPreview(url: string): Promise<LinkPreview> {
    const preview = await fetchLinkPreview(url);
    this.deps.requireDb().saveLinkPreview(hashUrl(preview.url), preview);
    return preview;
  }

  async getAllTags(): Promise<Tag[]> {
    return this.deps.requireDb().getAllTags() as Tag[];
  }

  async getTagsWithCounts(): Promise<Array<Tag & { usage_count: number }>> {
    return this.deps.requireDb().getTagsWithCounts() as Array<Tag & { usage_count: number }>;
  }

  async addImage(filePath: string): Promise<number> {
    const db = this.deps.requireDb();
    const embedder = this.deps.getEmbedder();
    const normalizedPath = path.resolve(filePath);
    const fileName = path.basename(filePath);
    const stats = await fs.stat(filePath);
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
      file_size: stats.size,
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

    const { id: imageId, created, fileHashMatched } = db.upsertImage(imageData);
    if (!created && fileHashMatched) {
      this.invalidateImageCache();
      return imageId;
    }

    const [embeddingResult, paletteResult] = await Promise.allSettled([
      embedder.embedImage(loaded),
      extractPalette(loaded),
    ]);

    if (embeddingResult.status === 'fulfilled') {
      try {
        db.insertEmbedding(imageId, embeddingResult.value);
      } catch (error) {
        console.error(`Failed to insert embedding for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to generate embedding for ${filePath}:`, embeddingResult.reason);
    }

    if (paletteResult.status === 'fulfilled') {
      try {
        db.insertPalette(imageId, paletteResult.value);
      } catch (error) {
        console.error(`Failed to insert palette for ${filePath}:`, error);
      }
    } else {
      console.error(`Failed to extract palette for ${filePath}:`, paletteResult.reason);
    }

    const folder = this.deps.getFolderForPath(filePath);
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

    this.invalidateImageCache();
    return imageId;
  }
}
