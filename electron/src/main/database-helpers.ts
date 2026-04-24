import { Image, PaletteColor, SUPPORTED_IMAGE_EXTENSIONS, parseOptionalJson } from 'shared';

export const IMAGE_EXTENSIONS = new Set(SUPPORTED_IMAGE_EXTENSIONS);

// Ligne SQLite images : champs `embedded` (0/1) et palette JSON.
export interface ImageDbRow extends Omit<Image, 'embedded' | 'palette'> {
  embedded: number;
  palette_json?: string | null;
}

export function hydratePalette(row: ImageDbRow): PaletteColor[] | null {
  return parseOptionalJson<PaletteColor[]>(row.palette_json);
}

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
