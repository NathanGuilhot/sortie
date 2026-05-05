import sharp from 'sharp';
import { loadImageInput } from 'pipeline';

export async function createDisplayOrientedPngBuffer(filePath: string): Promise<Buffer> {
  const input = await loadImageInput(filePath);
  return await sharp(input).rotate().png().toBuffer();
}
