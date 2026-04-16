import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs/promises';

/** Threshold: images with Hamming distance <= this are considered duplicates */
export const DHASH_DUPLICATE_THRESHOLD = 10;

/**
 * Compute difference hash (dHash) for an image.
 * Resize to 9x8 grayscale, compare adjacent horizontal pixels.
 * Returns 64-bit hash as 16-character hex string.
 */
export async function computeDHash(imagePath: string): Promise<string> {
  const pixels = await sharp(imagePath).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();

  let hash = BigInt(0);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      if (pixels[idx] > pixels[idx + 1]) {
        hash |= BigInt(1) << BigInt(row * 8 + col);
      }
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute SHA256 hash of a file's contents.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute Hamming distance between two hex-encoded dHash strings.
 * Returns number of differing bits (0-64).
 */
export function hammingDistance(hash1: string, hash2: string): number {
  const a = BigInt('0x' + hash1);
  const b = BigInt('0x' + hash2);
  let xor = a ^ b;
  let count = 0;
  while (xor > BigInt(0)) {
    count += Number(xor & BigInt(1));
    xor >>= BigInt(1);
  }
  return count;
}
