import { SUPPORTED_IMAGE_EXTENSIONS } from 'shared';

export const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

export const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
};
