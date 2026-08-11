import sharp from 'sharp';
import type { ImageEditTransform } from 'shared';

export async function renderImageEdit(
  input: Buffer,
  extension: string,
  transform: ImageEditTransform,
  options: { maxDimension?: number } = {},
): Promise<Buffer> {
  const normalized = await sharp(input).rotate().png().withMetadata({ orientation: 1 }).toBuffer();
  const turns = ((transform.clockwiseTurns % 4) + 4) % 4;
  const rotated = await sharp(normalized)
    .rotate(turns * 90)
    .png()
    .withMetadata({ orientation: 1 })
    .toBuffer({ resolveWithObject: true });
  const width = rotated.info.width;
  const height = rotated.info.height;
  const left = Math.min(width - 1, Math.max(0, Math.floor(transform.crop.left * width)));
  const top = Math.min(height - 1, Math.max(0, Math.floor(transform.crop.top * height)));
  const right = Math.min(width, Math.max(left + 1, Math.ceil(transform.crop.right * width)));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil(transform.crop.bottom * height)));
  let output = sharp(rotated.data);
  if (transform.flipHorizontal) output = output.flop();
  output = output
    .extract({ left, top, width: right - left, height: bottom - top })
    .withMetadata({ orientation: 1 });
  if (options.maxDimension != null) {
    output = output.resize(options.maxDimension, options.maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  if (extension === '.jpg' || extension === '.jpeg')
    return output.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  if (extension === '.webp') return output.webp({ quality: 95 }).toBuffer();
  return output.png().toBuffer();
}
