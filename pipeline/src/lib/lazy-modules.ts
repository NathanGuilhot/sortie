// Native and heavyweight modules load on first use instead of at import time,
// so requiring 'pipeline' during app startup stays cheap (sharp, exiftool and
// exifr together cost ~25ms on the critical path).
import type SharpFactory from 'sharp';
import type { ExifTool as ExifToolClass } from 'exiftool-vendored';
import type Exifr from 'exifr';

function once<T>(load: () => T): () => T {
  let loaded = false;
  let value: T;
  return () => {
    if (!loaded) {
      value = load();
      loaded = true;
    }
    return value;
  };
}

function interopDefault<T>(mod: unknown): T {
  const esm = mod as { __esModule?: boolean; default?: T };
  return (esm.__esModule && esm.default !== undefined ? esm.default : mod) as T;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const loadSharp = once(() => interopDefault<typeof SharpFactory>(require('sharp')));
const loadExifr = once(() => interopDefault<typeof Exifr>(require('exifr')));
const loadExifTool = once(
  () => (require('exiftool-vendored') as { ExifTool: typeof ExifToolClass }).ExifTool,
);
/* eslint-enable @typescript-eslint/no-require-imports */

/** Drop-in for `sharp(...)`. Typed as the call only: static members aren't proxied. */
export const sharp = (...args: Parameters<typeof SharpFactory>): ReturnType<typeof SharpFactory> =>
  loadSharp()(...args);

export function getExifr(): typeof Exifr {
  return loadExifr();
}

export function getExifToolClass(): typeof ExifToolClass {
  return loadExifTool();
}
