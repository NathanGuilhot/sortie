import fs from 'fs/promises';
import type { Stats } from 'fs';
import sharp from 'sharp';
import { computeFileHash } from './dhash';
import { isRawPath } from './raw';

export const ANALYSIS_VERSION = 1;
export const COMPARISON_SIZE = 64;

export interface FileAnalysis {
  source_hash: string;
  source_stamp: string;
  file_size: number;
  file_mtime_ms: number;
  version: number;
  width: number | null;
  height: number | null;
  fingerprint: string | null;
  pixels: Uint8Array | null;
  visual_error: string | null;
}

export function sourceStamp(stat: Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

export async function analyzeFile(filePath: string): Promise<FileAnalysis> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await fs.stat(filePath);
    if (!before.isFile()) throw new Error('The image is not a regular file.');
    const source_hash = await computeFileHash(filePath);
    const result: FileAnalysis = {
      source_hash,
      source_stamp: sourceStamp(before),
      file_size: before.size,
      file_mtime_ms: before.mtimeMs,
      version: ANALYSIS_VERSION,
      width: null,
      height: null,
      fingerprint: null,
      pixels: null,
      visual_error: null,
    };
    try {
      if (isRawPath(filePath)) throw new Error('RAW originals are compared by file contents only.');
      const metadata = await sharp(filePath, { limitInputPixels: 100_000_000 }).metadata();
      if ((metadata.pages ?? 1) > 1) {
        throw new Error('Animated and multipage images are compared by file contents only.');
      }
      const swapped = (metadata.orientation ?? 1) >= 5;
      result.width = (swapped ? metadata.height : metadata.width) ?? null;
      result.height = (swapped ? metadata.width : metadata.height) ?? null;
      const pixels = await sharp(filePath, { limitInputPixels: 100_000_000 })
        .rotate()
        .toColourspace('srgb')
        .ensureAlpha()
        .resize(COMPARISON_SIZE, COMPARISON_SIZE, { fit: 'fill' })
        .raw()
        .toBuffer();
      // Compare visible color and alpha separately, ignoring invisible RGB.
      for (let i = 0; i < pixels.length; i += 4) {
        for (let c = 0; c < 3; c++)
          pixels[i + c] = Math.round((pixels[i + c] * pixels[i + 3]) / 255);
      }
      result.pixels = pixels;
      const small = await sharp(pixels, {
        raw: { width: COMPARISON_SIZE, height: COMPARISON_SIZE, channels: 4 },
      })
        .removeAlpha()
        .resize(9, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer();
      let bits = 0n;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (small[row * 9 + col] > small[row * 9 + col + 1]) {
            bits |= 1n << BigInt(row * 8 + col);
          }
        }
      }
      result.fingerprint = bits.toString(16).padStart(16, '0');
    } catch (error) {
      result.visual_error = error instanceof Error ? error.message : String(error);
    }
    if (sourceStamp(await fs.stat(filePath)) === result.source_stamp) return result;
  }
  throw new Error('The image kept changing during analysis. Try scanning again.');
}

export function hammingDistance(left: string, right: string): number {
  let bits = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (bits) {
    bits &= bits - 1n;
    count++;
  }
  return count;
}

export function verifyVisualCopy(left: FileAnalysis, right: FileAnalysis): boolean {
  if (!left.width || !left.height || !right.width || !right.height || !left.pixels || !right.pixels)
    return false;
  const ratio = left.width / left.height / (right.width / right.height);
  if (Math.abs(Math.log(ratio)) > 0.01) return false;
  return comparePixels(left.pixels, right.pixels, COMPARISON_SIZE, 8);
}

function comparePixels(
  left: Uint8Array,
  right: Uint8Array,
  size: number,
  tileSize: number,
): boolean {
  if (left.length !== size ** 2 * 4 || right.length !== left.length) return false;
  let absolute = 0,
    squared = 0;
  const across = size / tileSize;
  const tiles = new Float64Array(across * across);
  for (let i = 0; i < left.length; i++) {
    const delta = Math.abs(left[i] - right[i]);
    if (i % 4 === 3 && delta > 8) return false;
    absolute += delta;
    squared += delta * delta;
    const pixel = Math.floor(i / 4);
    tiles[Math.floor(pixel / (size * tileSize)) * across + Math.floor((pixel % size) / tileSize)] +=
      delta;
  }
  return (
    absolute / left.length <= 5 &&
    Math.sqrt(squared / left.length) <= 12 &&
    tiles.every((sum) => sum / (tileSize * tileSize * 4) <= 12)
  );
}

// The small cached image only proposes candidates. Check local detail at a larger size before suggesting removal.
export async function verifyFileCopy(left: AnalyzedImage, right: AnalyzedImage): Promise<boolean> {
  const paths = [left.file_path, right.file_path];
  const expected = [left.source_stamp, right.source_stamp];
  if (
    !(
      await Promise.all(
        paths.map(async (file, i) => sourceStamp(await fs.stat(file)) === expected[i]),
      )
    ).every(Boolean)
  )
    return false;
  const size = Math.min(
    1024,
    Math.max(
      64,
      Math.floor(Math.min(left.width!, left.height!, right.width!, right.height!) / 16) * 16,
    ),
  );
  const images = await Promise.all(
    paths.map(async (file) => {
      const pixels = await sharp(file, { limitInputPixels: 100_000_000 })
        .rotate()
        .toColourspace('srgb')
        .ensureAlpha()
        .resize(size, size, { fit: 'fill' })
        .blur(0.5)
        .raw()
        .toBuffer();
      for (let i = 0; i < pixels.length; i += 4)
        for (let c = 0; c < 3; c++) {
          pixels[i + c] = Math.round((pixels[i + c] * pixels[i + 3]) / 255);
        }
      return pixels;
    }),
  );
  const stable = (
    await Promise.all(
      paths.map(async (file, i) => sourceStamp(await fs.stat(file)) === expected[i]),
    )
  ).every(Boolean);
  return stable && comparePixels(images[0], images[1], size, 16);
}

export interface AnalyzedImage extends FileAnalysis {
  id: number;
  file_path: string;
}
export interface MatchedImages {
  ids: number[];
  matchType: 'exact' | 'visual';
}

interface HashNode {
  hash: string;
  ids: number[];
  children: Map<number, HashNode>;
}

// A Hamming-distance tree avoids an all-pairs pass without limiting recall to k neighbors.
export async function matchDuplicates(
  images: AnalyzedImage[],
  dismissed: string[],
  verify: (left: AnalyzedImage, right: AnalyzedImage) => Promise<boolean> = verifyFileCopy,
): Promise<MatchedImages[]> {
  // Equal bytes need one representative, not a graph containing every copy pair.
  if (dismissed.length === 0) {
    const buckets = new Map<string, AnalyzedImage[]>();
    for (const image of images) {
      const bucket = buckets.get(image.source_hash) ?? [];
      bucket.push(image);
      buckets.set(image.source_hash, bucket);
    }
    if (buckets.size < images.length) {
      const representatives = [...buckets.values()].map(
        (bucket) => bucket.find((image) => image.fingerprint) ?? bucket[0],
      );
      const expanded = new Map(
        representatives.map((image) => [image.id, buckets.get(image.source_hash)!]),
      );
      const matches = await matchDuplicates(representatives, [], verify);
      const matched = new Set(matches.flatMap((group) => group.ids));
      return [
        ...matches.map((group) => ({
          ...group,
          ids: group.ids
            .flatMap((id) => expanded.get(id)!.map((image) => image.id))
            .sort((a, b) => a - b),
        })),
        ...representatives
          .filter((image) => !matched.has(image.id) && expanded.get(image.id)!.length > 1)
          .map(
            (image): MatchedImages => ({
              ids: expanded
                .get(image.id)!
                .map((member) => member.id)
                .sort((a, b) => a - b),
              matchType: 'exact',
            }),
          ),
      ].sort((a, b) => b.ids.length - a.ids.length || a.ids[0] - b.ids[0]);
    }
  }
  const ignored = new Set(dismissed);
  const key = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const byId = new Map(images.map((image) => [image.id, image]));
  const neighbors = new Map<number, Set<number>>();
  const connect = (a: number, b: number) => {
    if (ignored.has(key(a, b))) return;
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };
  const exact = new Map<string, number[]>();
  let root: HashNode | undefined;
  for (const image of images) {
    const bucket = exact.get(image.source_hash) ?? [];
    for (const id of bucket) connect(id, image.id);
    bucket.push(image.id);
    exact.set(image.source_hash, bucket);
    if (!image.fingerprint || !image.pixels) continue;
    const pending = root ? [root] : [];
    while (pending.length) {
      const node = pending.pop()!;
      const distance = hammingDistance(image.fingerprint, node.hash);
      if (distance <= 10)
        for (const id of node.ids) {
          const other = byId.get(id)!;
          if (
            other.source_hash !== image.source_hash &&
            !ignored.has(key(id, image.id)) &&
            verifyVisualCopy(image, other) &&
            (await verify(image, other))
          )
            connect(id, image.id);
        }
      for (const [edge, child] of node.children)
        if (Math.abs(edge - distance) <= 10) pending.push(child);
    }
    if (!root) {
      root = { hash: image.fingerprint, ids: [image.id], children: new Map() };
      continue;
    }
    let node = root;
    for (;;) {
      const distance = hammingDistance(image.fingerprint, node.hash);
      if (distance === 0) {
        node.ids.push(image.id);
        break;
      }
      const child = node.children.get(distance);
      if (child) node = child;
      else {
        node.children.set(distance, {
          hash: image.fingerprint,
          ids: [image.id],
          children: new Map(),
        });
        break;
      }
    }
  }
  const covered = new Set<string>();
  const groups: MatchedImages[] = [];
  for (const [a, adjacent] of neighbors)
    for (const b of adjacent) {
      if (a >= b || covered.has(key(a, b))) continue;
      const ids = [a, b];
      for (const candidate of adjacent) {
        if (!ids.includes(candidate) && ids.every((id) => neighbors.get(id)?.has(candidate)))
          ids.push(candidate);
      }
      ids.sort((a, b) => a - b);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) covered.add(key(ids[i], ids[j]));
      groups.push({
        ids,
        matchType: ids.every((id) => byId.get(id)!.source_hash === byId.get(ids[0])!.source_hash)
          ? 'exact'
          : 'visual',
      });
    }
  return groups.sort((a, b) => b.ids.length - a.ids.length || a.ids[0] - b.ids[0]);
}
