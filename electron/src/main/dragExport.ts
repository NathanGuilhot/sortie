import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { loadImageInput } from 'pipeline';
import { buildCacheKey } from './cacheKey';
import { getSortieUserDataPaths, type SortieUserDataPaths } from './userDataPaths';

const DRAG_ICON_SIZE = 180;
const DRAG_EXPORT_CACHE_MAX_BYTES = 512 * 1024 * 1024;

// Convert formats that common drop targets cannot display to JPEG.
const DIRECTLY_DRAGGABLE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

export interface PreparedDrag {
  /** The file handed to `startDrag` -- the original, or a display-ready export. */
  dragPath: string;
  /** Cached PNG for the drag cursor, or null if it could not be built. */
  iconPath: string | null;
}

const inFlight = new Map<string, Promise<PreparedDrag>>();

// Mousedown starts preparation; dragstart reuses the same work if it is still running.
export function prepareDrag(userDataPath: string, filePath: string): Promise<PreparedDrag> {
  const existing = inFlight.get(filePath);
  if (existing) return existing;

  const paths = getSortieUserDataPaths(userDataPath);
  const pending = buildDrag(paths, filePath).finally(() => {
    inFlight.delete(filePath);
  });
  inFlight.set(filePath, pending);
  return pending;
}

async function buildDrag(paths: SortieUserDataPaths, filePath: string): Promise<PreparedDrag> {
  let sourceMtimeMs: number;
  try {
    sourceMtimeMs = (await fs.promises.stat(filePath)).mtimeMs;
  } catch {
    return { dragPath: filePath, iconPath: null };
  }

  const hash = buildCacheKey(filePath);
  const [dragPath, iconPath] = await Promise.all([
    ensureDragPayload(paths, hash, filePath, sourceMtimeMs).catch((error) => {
      console.warn('[drag] export failed, dragging original:', error);
      return filePath;
    }),
    ensureDragIcon(paths, hash, filePath, sourceMtimeMs).catch((error) => {
      console.warn('[drag] icon failed:', error);
      return null;
    }),
  ]);

  return { dragPath, iconPath };
}

async function ensureDragIcon(
  paths: SortieUserDataPaths,
  hash: string,
  filePath: string,
  sourceMtimeMs: number,
): Promise<string> {
  const cachePath = path.join(paths.dragIcons, `${hash}.png`);
  if (await isFresh(cachePath, sourceMtimeMs)) return cachePath;

  const source = await pickIconSource(paths, hash, filePath);
  await fs.promises.mkdir(paths.dragIcons, { recursive: true });
  await sharp(source)
    .rotate()
    .resize(DRAG_ICON_SIZE, DRAG_ICON_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toFile(cachePath);
  return cachePath;
}

// Cheapest usable source first. In the common case the tile is on screen, so a
// thumbnail already exists and the original is never decoded.
async function pickIconSource(
  paths: SortieUserDataPaths,
  hash: string,
  filePath: string,
): Promise<string | Buffer> {
  const thumb = await findCachedThumb(paths.thumbs, hash);
  if (thumb) return thumb;

  const rawPreview = path.join(paths.rawPreviews, `${hash}.jpg`);
  if (await exists(rawPreview)) return rawPreview;

  return await loadImageInput(filePath);
}

// Thumbnails are cached per requested width (`<hash>_<width>.webp`), and the
// width depends on the column layout, so the name has to be discovered.
async function findCachedThumb(thumbDir: string, hash: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(thumbDir);
  } catch {
    return null;
  }

  const prefix = `${hash}_`;
  const candidates = entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.webp'))
    .map((entry) => ({
      entry,
      width: Number.parseInt(entry.slice(prefix.length, -'.webp'.length), 10),
    }))
    .filter((candidate) => Number.isFinite(candidate.width));
  if (candidates.length === 0) return null;

  // Smallest thumb that still covers the icon size, else the largest available.
  const covering = candidates
    .filter((candidate) => candidate.width >= DRAG_ICON_SIZE)
    .sort((left, right) => left.width - right.width);
  const best = covering[0] ?? candidates.sort((left, right) => right.width - left.width)[0];
  return path.join(thumbDir, best.entry);
}

async function ensureDragPayload(
  paths: SortieUserDataPaths,
  hash: string,
  filePath: string,
  sourceMtimeMs: number,
): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();
  if (DIRECTLY_DRAGGABLE.has(extension)) return filePath;

  // Keep each export in its own directory while preserving the original basename.
  const exportDir = path.join(paths.dragExports, hash);
  const exportPath = path.join(exportDir, `${path.basename(filePath, extension)}.jpg`);
  if (await isFresh(exportPath, sourceMtimeMs)) return exportPath;

  const source = await pickExportSource(paths, hash, filePath);
  const buffer = await sharp(source).rotate().jpeg({ quality: 92 }).toBuffer();

  await fs.promises.mkdir(exportDir, { recursive: true });
  await evictDragExportsIfFull(paths.dragExports, buffer.byteLength);
  await fs.promises.writeFile(exportPath, buffer);
  return exportPath;
}

async function pickExportSource(
  paths: SortieUserDataPaths,
  hash: string,
  filePath: string,
): Promise<string | Buffer> {
  // For RAW this preview is already on disk for any image that has been viewed,
  // and reusing it skips a second exiftool round trip.
  const rawPreview = path.join(paths.rawPreviews, `${hash}.jpg`);
  if (await exists(rawPreview)) return rawPreview;
  return await loadImageInput(filePath);
}

async function evictDragExportsIfFull(exportRoot: string, incomingBytes: number): Promise<void> {
  try {
    const names = await fs.promises.readdir(exportRoot);
    const entries = await Promise.all(
      names.map(async (name) => {
        const entryPath = path.join(exportRoot, name);
        const stats = await fs.promises.stat(entryPath);
        return { path: entryPath, size: await directorySize(entryPath), mtimeMs: stats.mtimeMs };
      }),
    );

    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total + incomingBytes <= DRAG_EXPORT_CACHE_MAX_BYTES) return;

    entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
    for (const entry of entries) {
      if (total + incomingBytes <= DRAG_EXPORT_CACHE_MAX_BYTES) break;
      try {
        await fs.promises.rm(entry.path, { recursive: true, force: true });
        total -= entry.size;
      } catch {
        // Cache cleanup is best-effort.
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    console.warn('[drag] export eviction sweep failed:', error);
  }
}

async function directorySize(dirPath: string): Promise<number> {
  try {
    const names = await fs.promises.readdir(dirPath);
    const sizes = await Promise.all(
      names.map(async (name) => (await fs.promises.stat(path.join(dirPath, name))).size),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch {
    return 0;
  }
}

async function isFresh(cachePath: string, sourceMtimeMs: number): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(cachePath);
    return stats.mtimeMs >= sourceMtimeMs;
  } catch {
    return false;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}
