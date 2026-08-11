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

function buildHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
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
  const hash = buildHash(request.sourcePath);
  const basePath = path.join(request.cacheDirectory, `${hash}_edit_base_${request.size}.webp`);
  const base = await getOrCreate(basePath, request.sourceMtimeMs, async () => {
    await sharp(request.inputPath)
      .rotate()
      .resize(request.size, request.size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 0 })
      .toFile(basePath);
  });

  if (request.clockwiseTurns === 0 && !request.flipHorizontal) return base;

  const previewPath = path.join(
    request.cacheDirectory,
    `${hash}_edit_${request.clockwiseTurns}_${request.flipHorizontal ? 1 : 0}_${request.size}.webp`,
  );
  return getOrCreate(previewPath, request.sourceMtimeMs, async () => {
    let preview = sharp(base).rotate(request.clockwiseTurns * 90);
    if (request.flipHorizontal) preview = preview.flop();
    await preview.webp({ quality: 85, effort: 0 }).toFile(previewPath);
  });
}
