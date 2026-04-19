import type { Image } from 'shared';

export function isGif(image: Pick<Image, 'mime_type' | 'file_path'>): boolean {
  if (image.mime_type === 'image/gif') return true;
  return image.file_path.toLowerCase().endsWith('.gif');
}

export function isGifUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  return path.toLowerCase().endsWith('.gif');
}
