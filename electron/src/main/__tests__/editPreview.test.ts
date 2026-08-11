import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { getCachedEditPreview } from '../editPreview';
import { buildCacheKey } from '../cacheKey';

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

  it('rotates clockwise in the displayed coordinate space after a horizontal flip', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-edit-preview-'));
    temporaryDirectories.push(directory);
    const sourcePath = path.join(directory, 'source.png');
    const cacheDirectory = path.join(directory, 'cache');
    await fs.mkdir(cacheDirectory);
    const width = 8;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 3);
    const colors = {
      red: [255, 0, 0],
      green: [0, 255, 0],
      blue: [0, 0, 255],
      white: [255, 255, 255],
    } as const;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color =
          y < height / 2
            ? x < width / 2
              ? colors.red
              : colors.green
            : x < width / 2
              ? colors.blue
              : colors.white;
        pixels.set(color, (y * width + x) * 3);
      }
    }
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(sourcePath);
    const sourceMtimeMs = (await fs.stat(sourcePath)).mtimeMs;
    const sourceHash = buildCacheKey(sourcePath);
    const legacyPath = path.join(cacheDirectory, `${sourceHash}_edit_3_1_8.webp`);
    await sharp({
      create: { width: 4, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .webp()
      .toFile(legacyPath);

    const previewPath = await getCachedEditPreview({
      cacheDirectory,
      sourcePath,
      inputPath: sourcePath,
      sourceMtimeMs,
      size: 8,
      clockwiseTurns: 3,
      flipHorizontal: true,
    });
    const preview = await sharp(previewPath).raw().toBuffer({ resolveWithObject: true });
    const pixelAt = (x: number, y: number) => {
      const offset = (y * preview.info.width + x) * preview.info.channels;
      return Array.from(preview.data.subarray(offset, offset + 3));
    };
    const classify = ([red, green, blue]: number[]) => {
      if (red > 200 && green > 200 && blue > 200) return 'white';
      if (red > green && red > blue) return 'red';
      if (green > red && green > blue) return 'green';
      return 'blue';
    };

    expect(previewPath).not.toBe(legacyPath);
    expect(path.basename(previewPath)).toContain('_edit_v2_3_1_8.webp');
    expect(
      [
        pixelAt(0, 0),
        pixelAt(preview.info.width - 1, 0),
        pixelAt(0, preview.info.height - 1),
        pixelAt(preview.info.width - 1, preview.info.height - 1),
      ].map(classify),
    ).toEqual(['white', 'green', 'blue', 'red']);
  });
});
