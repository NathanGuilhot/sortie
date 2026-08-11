import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareDrag } from '../dragExport';
import { buildCacheKey } from '../cacheKey';
import { getSortieUserDataPaths } from '../userDataPaths';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

async function makeWorkspace(): Promise<{ userDataPath: string; libraryPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-drag-export-'));
  temporaryDirectories.push(root);
  const userDataPath = path.join(root, 'userData');
  const libraryPath = path.join(root, 'library');
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.mkdir(libraryPath, { recursive: true });
  return { userDataPath, libraryPath };
}

function solidImage(color: { r: number; g: number; b: number }) {
  return sharp({ create: { width: 400, height: 400, channels: 3, background: color } });
}

async function firstPixel(filePath: string): Promise<[number, number, number]> {
  const { data } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}

describe('prepareDrag', () => {
  it('drags the original file for formats every app can render', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'photo.jpg');
    await solidImage({ r: 200, g: 30, b: 30 }).jpeg().toFile(filePath);

    const { dragPath, iconPath } = await prepareDrag(userDataPath, filePath);

    expect(dragPath).toBe(filePath);
    expect(iconPath).toBe(
      path.join(getSortieUserDataPaths(userDataPath).dragIcons, `${buildCacheKey(filePath)}.png`),
    );
    const icon = await sharp(iconPath!).metadata();
    expect(icon.format).toBe('png');
    expect(icon.width).toBe(180);
  });

  it('builds the cursor icon from the cached thumbnail rather than the original', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'photo.jpg');
    await solidImage({ r: 220, g: 20, b: 20 }).jpeg().toFile(filePath);

    // A blue thumbnail standing in for the one the gallery already rendered.
    const thumbs = getSortieUserDataPaths(userDataPath).thumbs;
    await fs.mkdir(thumbs, { recursive: true });
    await solidImage({ r: 20, g: 20, b: 220 })
      .webp()
      .toFile(path.join(thumbs, `${buildCacheKey(filePath)}_400.webp`));

    const { iconPath } = await prepareDrag(userDataPath, filePath);

    const [red, , blue] = await firstPixel(iconPath!);
    expect(blue).toBeGreaterThan(red);
  });

  it('exports formats a drop target cannot render, keeping the original name', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'IMG_0042.tiff');
    await solidImage({ r: 40, g: 160, b: 40 }).tiff().toFile(filePath);

    const { dragPath } = await prepareDrag(userDataPath, filePath);

    const exports = getSortieUserDataPaths(userDataPath).dragExports;
    expect(dragPath).toBe(path.join(exports, buildCacheKey(filePath), 'IMG_0042.jpg'));
    expect((await sharp(dragPath).metadata()).format).toBe('jpeg');
  });

  it('rebuilds cached artefacts once the source file changes', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'photo.jpg');
    await solidImage({ r: 220, g: 20, b: 20 }).jpeg().toFile(filePath);

    const { iconPath } = await prepareDrag(userDataPath, filePath);
    const [redBefore, , blueBefore] = await firstPixel(iconPath!);
    expect(redBefore).toBeGreaterThan(blueBefore);

    await solidImage({ r: 20, g: 20, b: 220 }).jpeg().toFile(filePath);
    const future = new Date(Date.now() + 10_000);
    await fs.utimes(filePath, future, future);

    const { iconPath: rebuilt } = await prepareDrag(userDataPath, filePath);
    const [redAfter, , blueAfter] = await firstPixel(rebuilt!);
    expect(blueAfter).toBeGreaterThan(redAfter);
  });

  it('shares one preparation between the mousedown and dragstart calls', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'photo.jpg');
    await solidImage({ r: 90, g: 90, b: 90 }).jpeg().toFile(filePath);

    const first = prepareDrag(userDataPath, filePath);
    const second = prepareDrag(userDataPath, filePath);

    expect(second).toBe(first);
    await first;
  });

  it('falls back to the original file when it cannot be read', async () => {
    const { userDataPath, libraryPath } = await makeWorkspace();
    const filePath = path.join(libraryPath, 'gone.tiff');

    const { dragPath, iconPath } = await prepareDrag(userDataPath, filePath);

    expect(dragPath).toBe(filePath);
    expect(iconPath).toBeNull();
  });
});
