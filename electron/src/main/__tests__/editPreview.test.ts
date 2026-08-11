import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { getCachedEditPreview } from '../editPreview';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

describe('getCachedEditPreview', () => {
  it('derives a new orientation from the bounded source preview', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-edit-preview-'));
    temporaryDirectories.push(directory);
    const sourcePath = path.join(directory, 'source.png');
    const cacheDirectory = path.join(directory, 'cache');
    await fs.mkdir(cacheDirectory);
    const pixels = Buffer.from([
      255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255,
    ]);
    await sharp(pixels, { raw: { width: 3, height: 2, channels: 3 } })
      .png()
      .toFile(sourcePath);
    const sourceMtimeMs = (await fs.stat(sourcePath)).mtimeMs;
    const request = {
      cacheDirectory,
      sourcePath,
      inputPath: sourcePath,
      sourceMtimeMs,
      size: 3,
    };

    await getCachedEditPreview({
      ...request,
      clockwiseTurns: 0,
      flipHorizontal: false,
    });
    await fs.unlink(sourcePath);

    const rotatedPath = await getCachedEditPreview({
      ...request,
      clockwiseTurns: 1,
      flipHorizontal: false,
    });
    const rotated = await sharp(rotatedPath).raw().toBuffer({ resolveWithObject: true });

    expect([rotated.info.width, rotated.info.height]).toEqual([2, 3]);
  });
});
