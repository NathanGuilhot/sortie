import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import {
  analyzeFile,
  matchDuplicates,
  verifyVisualCopy,
  verifyFileCopy,
  type AnalyzedImage,
} from '../duplicate-analysis';

const artwork = Buffer.from(
  `<svg width="320" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="240" fill="#f8dfb7"/><rect x="20" y="30" width="100" height="150" fill="#4a9b86"/><circle cx="190" cy="110" r="65" fill="#b34a73"/><path d="M10 210L130 140L280 220" stroke="#282940" stroke-width="12" fill="none"/><rect x="230" y="15" width="60" height="60" fill="#4283bb"/></svg>`,
);

function analyzed(id: number, offset = 0): AnalyzedImage {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = (Math.floor(i / 4) % 64 < 32 ? 90 : 170) + offset;
    pixels[i + 3] = 255;
  }
  return {
    id,
    file_path: `/test/${id}.png`,
    source_hash: String(id),
    source_stamp: String(id),
    file_size: 100,
    file_mtime_ms: 1,
    version: 1,
    width: 320,
    height: 240,
    fingerprint: 'abcd1234abcd1234',
    pixels,
    visual_error: null,
  };
}

describe('duplicate analysis', () => {
  let folder: string;
  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-duplicates-'));
  });
  afterEach(async () => {
    await fs.rm(folder, { recursive: true, force: true });
  });

  it('finds lossless cross-format, lossy and resized copies without embeddings', async () => {
    const files = ['source.png', 'lossless.webp', 'lossy.webp', 'small.jpg'].map((name) =>
      path.join(folder, name),
    );
    await sharp(artwork).png().toFile(files[0]);
    await sharp(artwork).webp({ lossless: true }).toFile(files[1]);
    await sharp(artwork).webp({ quality: 85 }).toFile(files[2]);
    await sharp(artwork).resize(160, 120).jpeg({ quality: 90 }).toFile(files[3]);
    const images = await Promise.all(
      files.map(async (file, i) => ({ ...(await analyzeFile(file)), id: i + 1, file_path: file })),
    );
    const result = await matchDuplicates(images, []);
    expect(result).toEqual([{ ids: [1, 2, 3, 4], matchType: 'visual' }]);
    expect(new Set(images.map((i) => i.source_hash)).size).toBe(4);
  });

  it('normalizes EXIF orientation before comparison', async () => {
    const upright = path.join(folder, 'upright.png');
    const rotated = path.join(folder, 'rotated.png');
    await sharp(artwork).png().toFile(upright);
    await sharp(artwork).rotate(90).withMetadata({ orientation: 8 }).png().toFile(rotated);
    expect(verifyVisualCopy(await analyzeFile(upright), await analyzeFile(rotated))).toBe(true);
  });

  it('preserves opacity and rejects different images, proportions and local edits', () => {
    const original = analyzed(1);
    const different = analyzed(2, 40);
    expect(verifyVisualCopy(original, different)).toBe(false);
    expect(verifyVisualCopy(original, { ...analyzed(2), width: 200 })).toBe(false);
    const transparent = analyzed(2);
    transparent.pixels![3] = 0;
    expect(verifyVisualCopy(original, transparent)).toBe(false);
    const edited = analyzed(2);
    for (let row = 16; row < 24; row++)
      for (let col = 16; col < 24; col++) {
        edited.pixels![(row * 64 + col) * 4] = 255;
      }
    expect(verifyVisualCopy(original, edited)).toBe(false);
  });

  it('never groups non-transitive matches or dismissed pairs together', async () => {
    const images = [analyzed(1), analyzed(2, 5), analyzed(3, 10)];
    expect(await matchDuplicates(images, [], async () => true)).toEqual([
      { ids: [1, 2], matchType: 'visual' },
      { ids: [2, 3], matchType: 'visual' },
    ]);
    expect(await matchDuplicates(images, ['1:2'], async () => true)).toEqual([
      { ids: [2, 3], matchType: 'visual' },
    ]);
  });

  it('finds every copy beyond the previous twelve-neighbor limit', async () => {
    const images = Array.from({ length: 20 }, (_, i) => ({
      ...analyzed(i + 1),
      source_hash: 'identical',
    }));
    expect(await matchDuplicates(images, [], async () => true)).toEqual([
      { ids: images.map((image) => image.id), matchType: 'exact' },
    ]);
  });

  it('rejects small but meaningful text edits that disappear in the cached thumbnail', async () => {
    const paths = ['100.00', '900.00'].map((_, i) => path.join(folder, `invoice-${i}.png`));
    for (const [i, amount] of ['100.00', '900.00'].entries()) {
      const svg = Buffer.from(
        `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="white"/><rect x="100" y="100" width="1000" height="450" fill="#d7e5ed"/><text x="100" y="750" font-family="sans-serif" font-size="18">Invoice ${amount}</text></svg>`,
      );
      await sharp(svg).png().toFile(paths[i]);
    }
    const images = await Promise.all(
      paths.map(async (file, i) => ({ ...(await analyzeFile(file)), id: i + 1, file_path: file })),
    );
    expect(verifyVisualCopy(images[0], images[1])).toBe(true);
    expect(await verifyFileCopy(images[0], images[1])).toBe(false);
    expect(await matchDuplicates(images, [])).toEqual([]);
  });

  it('does not call a matching first frame a duplicate animation', async () => {
    const animation = path.join(folder, 'animated.gif');
    await fs.writeFile(
      animation,
      Buffer.from(
        'R0lGODlhCAAIAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAACAAIAAAIDwABCBxIsKDBgwgTKkwYEAAh+QQBFAABACwAAAAACAAIAIEAAP8AAAAAAAAAAAAIDwABCBxIsKDBgwgTKkwYEAA7',
        'base64',
      ),
    );
    const result = await analyzeFile(animation);
    expect(result.fingerprint).toBeNull();
    expect(result.visual_error).toContain('Animated');
    expect(result.source_hash).toHaveLength(64);
  });

  it('retains byte equality for undecodable files and RAW originals', async () => {
    const bad = path.join(folder, 'bad.png');
    const raw = path.join(folder, 'raw.nef');
    await fs.writeFile(bad, 'not an image');
    await fs.writeFile(raw, 'original raw');
    const a = await analyzeFile(bad),
      b = await analyzeFile(raw);
    expect(a.visual_error).toBeTruthy();
    expect(b.visual_error).toContain('RAW');
    expect(a.fingerprint).toBeNull();
    expect(a.source_hash).toHaveLength(64);
  });
});
