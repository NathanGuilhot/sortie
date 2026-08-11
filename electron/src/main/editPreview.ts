import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export interface EditPreviewRequest {
  cacheDirectory: string;
  sourcePath: string;
  inputPath: string;
  sourceMtimeMs: number;
  size: number;
  clockwiseTurns: number;
  flipHorizontal: boolean;
}

const pendingPreviews = new Map<string, Promise<string>>();
const EDIT_PREVIEW_CACHE_VERSION = 2;

function buildHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function buildEditPreviewCachePath(
  request: Pick<
    EditPreviewRequest,
    'cacheDirectory' | 'sourcePath' | 'size' | 'clockwiseTurns' | 'flipHorizontal'
  >,
): string {
  const hash = buildHash(request.sourcePath);
  if (request.clockwiseTurns === 0 && !request.flipHorizontal) {
    return path.join(request.cacheDirectory, `${hash}_edit_base_${request.size}.webp`);
  }
  return path.join(
    request.cacheDirectory,
    `${hash}_edit_v${EDIT_PREVIEW_CACHE_VERSION}_${request.clockwiseTurns}_${request.flipHorizontal ? 1 : 0}_${request.size}.webp`,
  );
}

async function isFresh(cachePath: string, sourceMtimeMs: number): Promise<boolean> {
  try {
    return (await fs.stat(cachePath)).mtimeMs >= sourceMtimeMs;
  } catch {
    return false;
  }
}

function getOrCreate(
  cachePath: string,
  sourceMtimeMs: number,
  create: () => Promise<void>,
): Promise<string> {
  const pending = pendingPreviews.get(cachePath);
  if (pending) return pending;

  const result = (async () => {
    if (!(await isFresh(cachePath, sourceMtimeMs))) await create();
    return cachePath;
  })();
  pendingPreviews.set(cachePath, result);
  void result.then(
    () => pendingPreviews.delete(cachePath),
    () => pendingPreviews.delete(cachePath),
  );
  return result;
}

export async function getCachedEditPreview(request: EditPreviewRequest): Promise<string> {
  const basePath = buildEditPreviewCachePath({
    ...request,
    clockwiseTurns: 0,
    flipHorizontal: false,
  });
  const base = await getOrCreate(basePath, request.sourceMtimeMs, async () => {
    await sharp(request.inputPath)
      .rotate()
      .resize(request.size, request.size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 0 })
      .toFile(basePath);
  });

  if (request.clockwiseTurns === 0 && !request.flipHorizontal) return base;

  const previewPath = buildEditPreviewCachePath(request);
  return getOrCreate(previewPath, request.sourceMtimeMs, async () => {
    const previewTurns = request.flipHorizontal
      ? (4 - request.clockwiseTurns) % 4
      : request.clockwiseTurns;
    let preview = sharp(base).rotate(previewTurns * 90);
    // Sharp always applies flop before rotation in a combined pipeline. Reversing
    // the rotation above makes that composition equivalent to rotate-then-flop.
    if (request.flipHorizontal) preview = preview.flop();
    await preview.webp({ quality: 85, effort: 0 }).toFile(previewPath);
  });
}
