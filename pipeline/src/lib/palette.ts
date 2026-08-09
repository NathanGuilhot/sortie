import sharp from 'sharp';
import { resolveImageInput } from './raw';
import kmeans from 'kmeans-ts';
import { PaletteColor } from 'shared';

export const PALETTE_SIZE = 5;

// Downsample before clustering: ~10k pixels is plenty to converge on
// dominant colors while keeping k-means fast (<50ms per image typical).
const SAMPLE_EDGE = 100;

const KMEANS_MAX_ITERATIONS = 15;

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// OKLab (Björn Ottosson, 2020): a perceptual color space with better hue
// uniformity than CIELAB. Numeric ranges: L ∈ [0, 1], a/b ≈ [-0.4, 0.4].
function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function hexToOklab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToOklab(rgb[0], rgb[1], rgb[2]);
}

// `lab` in PaletteColor holds OKLab coordinates: the name is kept for schema continuity.
export async function extractPalette(input: string | Buffer): Promise<PaletteColor[]> {
  const { data, info } = await sharp(await resolveImageInput(input))
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels; // should be 4 after ensureAlpha
  const pixelCount = info.width * info.height;

  const points: Array<[number, number, number]> = [];
  for (let i = 0; i < pixelCount; i++) {
    const off = i * channels;
    const alpha = data[off + 3];
    if (alpha < 128) continue;
    points.push(rgbToOklab(data[off], data[off + 1], data[off + 2]));
  }

  if (points.length === 0) return [];

  const k = Math.min(PALETTE_SIZE, points.length);
  const result = kmeans(points, k, 'kmeans++', KMEANS_MAX_ITERATIONS);

  const counts = new Array<number>(k).fill(0);
  for (const idx of result.indexes) counts[idx]++;

  const total = points.length;
  const palette: PaletteColor[] = result.centroids.map((centroid, idx) => {
    const [L, a, b] = centroid as [number, number, number];
    const [r, g, bl] = oklabToRgb(L, a, b);
    return {
      hex: rgbToHex(r, g, bl),
      rgb: [r, g, bl],
      lab: [L, a, b],
      weight: counts[idx] / total,
    };
  });

  palette.sort((a, b) => b.weight - a.weight);
  return palette;
}
