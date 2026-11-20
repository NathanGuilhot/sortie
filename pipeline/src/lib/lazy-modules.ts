import type Sharp from 'sharp';

// Loaded on first call so importing 'pipeline' at startup doesn't load libvips.
export const sharp = (...args: Parameters<typeof Sharp>): ReturnType<typeof Sharp> =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('sharp') as typeof Sharp)(...args);
