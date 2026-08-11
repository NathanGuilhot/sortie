import { net, protocol } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';
import { isRawPath, loadImageInput } from 'pipeline';
import { buildEditPreviewCachePath, getCachedEditPreview } from './editPreview';
import { buildCacheKey } from './cacheKey';
import { getSortieUserDataPaths } from './userDataPaths';

const RAW_PREVIEW_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_EDIT_PREVIEW_SIZE = 1600;

export function registerSortieSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'sortie-file', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
    {
      scheme: 'sortie-thumb',
      privileges: { bypassCSP: true, supportFetchAPI: true, stream: true },
    },
    {
      scheme: 'sortie-edit-preview',
      privileges: { bypassCSP: true, supportFetchAPI: true, stream: true },
    },
    { scheme: 'sortie-face', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } },
    {
      scheme: 'sortie-preview',
      privileges: { bypassCSP: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function invalidateThumbnailCache(
  userDataPath: string,
  filePath: string,
): Promise<void> {
  const paths = getSortieUserDataPaths(userDataPath);
  const hash = buildCacheKey(filePath);
  await Promise.all([
    ...[paths.thumbs, paths.faceThumbs].map(async (directory) => {
      let entries: string[];
      try {
        entries = await fs.promises.readdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      await Promise.all(
        entries
          .filter((entry) => entry.startsWith(`${hash}_`))
          .map((entry) => fs.promises.unlink(path.join(directory, entry))),
      );
    }),
    // Drag artefacts are keyed by the bare hash: a single icon file, and a
    // directory holding the export under its original basename.
    fs.promises.rm(path.join(paths.dragIcons, `${hash}.png`), { force: true }),
    fs.promises.rm(path.join(paths.dragExports, hash), { recursive: true, force: true }),
  ]);
}

function fetchLocalFile(filePath: string): Promise<Response> {
  return net.fetch(pathToFileURL(filePath).toString());
}

function getFilePathFromUrl(url: URL): string {
  const queryPath = url.searchParams.get('path');
  if (queryPath !== null) return queryPath;
  return decodeURIComponent(url.pathname);
}

function evictRawPreviewCacheIfFull(rawPreviewDir: string, incomingBytes: number): void {
  try {
    const entries = fs.readdirSync(rawPreviewDir).map((name) => {
      const entryPath = path.join(rawPreviewDir, name);
      const stats = fs.statSync(entryPath);
      return { path: entryPath, size: stats.size, mtimeMs: stats.mtimeMs };
    });
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total + incomingBytes <= RAW_PREVIEW_CACHE_MAX_BYTES) return;

    entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
    for (const entry of entries) {
      if (total + incomingBytes <= RAW_PREVIEW_CACHE_MAX_BYTES) break;
      try {
        fs.unlinkSync(entry.path);
        total -= entry.size;
      } catch {
        // Cache cleanup is best-effort.
      }
    }
  } catch (error) {
    console.warn('[raw-preview] eviction sweep failed:', error);
  }
}

async function getCachedRawPreview(rawPreviewDir: string, filePath: string): Promise<string> {
  const cachePath = path.join(rawPreviewDir, `${buildCacheKey(filePath)}.jpg`);
  const sourceStats = fs.statSync(filePath);

  try {
    const cacheStats = fs.statSync(cachePath);
    if (cacheStats.mtimeMs >= sourceStats.mtimeMs) {
      return cachePath;
    }
  } catch {
    // Cache miss.
  }

  const loaded = await loadImageInput(filePath);
  if (typeof loaded === 'string') {
    return loaded;
  }

  evictRawPreviewCacheIfFull(rawPreviewDir, loaded.byteLength);
  fs.writeFileSync(cachePath, loaded);
  return cachePath;
}

export function registerSortieProtocols(
  userDataPath: string,
  isServable: (requestedPath: string) => Promise<boolean>,
): void {
  const paths = getSortieUserDataPaths(userDataPath);
  ensureDir(paths.thumbs);
  ensureDir(paths.rawPreviews);
  ensureDir(paths.faceThumbs);
  ensureDir(paths.linkPreviews);

  protocol.handle('sortie-file', async (request) => {
    const filePath = getFilePathFromUrl(new URL(request.url));
    if (!(await isServable(filePath))) {
      return new Response(null, { status: 403 });
    }
    if (!isRawPath(filePath)) {
      return fetchLocalFile(filePath);
    }

    try {
      const cachePath = await getCachedRawPreview(paths.rawPreviews, filePath);
      return fetchLocalFile(cachePath);
    } catch (error) {
      console.error('[sortie-file] RAW preview extraction failed:', error);
      return new Response(null, { status: 415 });
    }
  });

  protocol.handle('sortie-thumb', async (request) => {
    const url = new URL(request.url);
    const filePath = getFilePathFromUrl(url);
    if (!(await isServable(filePath))) {
      return new Response(null, { status: 403 });
    }
    const width = parseInt(url.searchParams.get('w') || '400', 10);
    const cachePath = path.join(paths.thumbs, `${buildCacheKey(filePath)}_${width}.webp`);

    let sourceStats: fs.Stats;
    try {
      sourceStats = fs.statSync(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EIO') {
        if (fs.existsSync(cachePath)) {
          return fetchLocalFile(cachePath);
        }
        return new Response(null, { status: 410 });
      }

      console.error('[thumb] stat failed:', error);
      return new Response(null, { status: 500 });
    }

    try {
      let useCached = false;
      try {
        const cacheStats = fs.statSync(cachePath);
        useCached = cacheStats.mtimeMs >= sourceStats.mtimeMs;
      } catch {
        // Cache miss.
      }

      if (!useCached) {
        const input = isRawPath(filePath)
          ? await getCachedRawPreview(paths.rawPreviews, filePath)
          : filePath;
        await sharp(input)
          .rotate()
          .resize(width, null, { withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(cachePath);
      }

      return fetchLocalFile(cachePath);
    } catch (error) {
      console.error('[thumb] failed:', error);
      if (fs.existsSync(cachePath)) {
        return fetchLocalFile(cachePath);
      }
      return new Response(null, { status: 500 });
    }
  });

  protocol.handle('sortie-edit-preview', async (request) => {
    const url = new URL(request.url);
    const filePath = getFilePathFromUrl(url);
    if (!(await isServable(filePath))) {
      return new Response(null, { status: 403 });
    }

    const turns = Number(url.searchParams.get('turns'));
    const flippedParam = url.searchParams.get('flipped');
    const size = Number(url.searchParams.get('size'));
    if (
      !Number.isInteger(turns) ||
      turns < 0 ||
      turns > 3 ||
      (flippedParam !== 'true' && flippedParam !== 'false') ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > MAX_EDIT_PREVIEW_SIZE
    ) {
      return new Response(null, { status: 400 });
    }
    const flipped = flippedParam === 'true';
    const cachePath = buildEditPreviewCachePath({
      cacheDirectory: paths.thumbs,
      sourcePath: filePath,
      size,
      clockwiseTurns: turns,
      flipHorizontal: flipped,
    });

    let sourceStats: fs.Stats;
    try {
      sourceStats = fs.statSync(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES' || code === 'EIO') {
        return new Response(null, { status: 410 });
      }
      return new Response(null, { status: 500 });
    }

    try {
      const inputPath = isRawPath(filePath)
        ? await getCachedRawPreview(paths.rawPreviews, filePath)
        : filePath;
      const previewPath = await getCachedEditPreview({
        cacheDirectory: paths.thumbs,
        sourcePath: filePath,
        inputPath,
        sourceMtimeMs: sourceStats.mtimeMs,
        size,
        clockwiseTurns: turns,
        flipHorizontal: flipped,
      });
      return fetchLocalFile(previewPath);
    } catch (error) {
      console.error('[edit-preview] failed:', error);
      if (fs.existsSync(cachePath)) {
        return fetchLocalFile(cachePath);
      }
      return new Response(null, { status: 500 });
    }
  });

  protocol.handle('sortie-face', async (request) => {
    const url = new URL(request.url);
    const faceId = url.hostname;
    const filePath = decodeURIComponent(url.searchParams.get('path') || '');
    if (!(await isServable(filePath))) {
      return new Response(null, { status: 403 });
    }
    const bboxX = parseFloat(url.searchParams.get('x') || '0');
    const bboxY = parseFloat(url.searchParams.get('y') || '0');
    const bboxWidth = parseFloat(url.searchParams.get('w') || '0');
    const bboxHeight = parseFloat(url.searchParams.get('h') || '0');
    const size = parseInt(url.searchParams.get('size') || '200', 10);

    const bboxKey = `${bboxX.toFixed(4)}_${bboxY.toFixed(4)}_${bboxWidth.toFixed(4)}_${bboxHeight.toFixed(4)}`;
    const cachePath = path.join(
      paths.faceThumbs,
      `${buildCacheKey(filePath)}_${buildCacheKey(`${faceId}_${bboxKey}`)}_${size}.jpg`,
    );

    try {
      if (fs.existsSync(cachePath)) {
        return fetchLocalFile(cachePath);
      }

      try {
        fs.statSync(filePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EIO') {
          return new Response(null, { status: 410 });
        }
        throw error;
      }

      const faceInput = isRawPath(filePath)
        ? await getCachedRawPreview(paths.rawPreviews, filePath)
        : filePath;
      const metadata = await sharp(faceInput).metadata();
      const orientation = metadata.orientation ?? 1;
      const swapDimensions = orientation >= 5 && orientation <= 8;
      const imageWidth = swapDimensions ? (metadata.height ?? 1) : (metadata.width ?? 1);
      const imageHeight = swapDimensions ? (metadata.width ?? 1) : (metadata.height ?? 1);

      const padding = 0.3;
      const left = Math.max(0, Math.round((bboxX - bboxWidth * padding) * imageWidth));
      const top = Math.max(0, Math.round((bboxY - bboxHeight * padding) * imageHeight));
      const right = Math.min(
        imageWidth,
        Math.round((bboxX + bboxWidth * (1 + padding)) * imageWidth),
      );
      const bottom = Math.min(
        imageHeight,
        Math.round((bboxY + bboxHeight * (1 + padding)) * imageHeight),
      );

      await sharp(faceInput)
        .rotate()
        .extract({
          left,
          top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        })
        .resize(size, size, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toFile(cachePath);

      return fetchLocalFile(cachePath);
    } catch (error) {
      console.error('[face-thumb] failed:', error);
      return new Response('Face thumbnail error', { status: 500 });
    }
  });

  protocol.handle('sortie-preview', (request) => {
    const relativePath = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    const filePath = path.join(paths.linkPreviews, relativePath);
    if (!filePath.startsWith(paths.linkPreviews)) {
      return new Response(null, { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      return new Response(null, { status: 404 });
    }
    return fetchLocalFile(filePath);
  });
}
