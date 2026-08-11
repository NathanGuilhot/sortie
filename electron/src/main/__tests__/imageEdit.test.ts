import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderImageEdit } from '../imageEdit';

describe('renderImageEdit', () => {
  it('keeps a crop attached to its source pixels when rotating afterward', async () => {
    const pixels = Buffer.from([
      1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0, 5, 0, 0, 6, 0, 0, 7, 0, 0, 8, 0, 0,
    ]);
    const source = await sharp(pixels, { raw: { width: 4, height: 2, channels: 3 } })
      .png()
      .toBuffer();
    const output = await renderImageEdit(source, '.png', {
      crop: { left: 0, top: 0, right: 1, bottom: 0.5 },
      clockwiseTurns: 1,
      flipHorizontal: false,
    });
    const decoded = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect([decoded.info.width, decoded.info.height]).toEqual([2, 2]);
    expect(Array.from(decoded.data).filter((_, index) => index % 3 === 0)).toEqual([5, 1, 6, 2]);
  });

  it('renders the same orientation into a bounded preview', async () => {
    const width = 8;
    const height = 4;
    const pixels = Buffer.alloc(width * height * 3);
    const colors = {
      red: [255, 0, 0],
      green: [0, 255, 0],
      blue: [0, 0, 255],
      white: [255, 255, 255],
    } as const;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color =
          y < height / 2
            ? x < width / 2
              ? colors.red
              : colors.green
            : x < width / 2
              ? colors.blue
              : colors.white;
        pixels.set(color, (y * width + x) * 3);
      }
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const preview = await renderImageEdit(
      source,
      '.png',
      {
        crop: { left: 0, top: 0, right: 1, bottom: 1 },
        clockwiseTurns: 1,
        flipHorizontal: true,
      },
      { maxDimension: 4 },
    );
    const decoded = await sharp(preview).raw().toBuffer({ resolveWithObject: true });
    const pixelAt = (x: number, y: number) => {
      const offset = (y * decoded.info.width + x) * decoded.info.channels;
      return Array.from(decoded.data.subarray(offset, offset + 3));
    };
    const classify = ([red, green, blue]: number[]) => {
      if (red > 200 && green > 200 && blue > 200) return 'white';
      if (red > green && red > blue) return 'red';
      if (green > red && green > blue) return 'green';
      return 'blue';
    };

    expect([decoded.info.width, decoded.info.height]).toEqual([2, 4]);
    expect([pixelAt(0, 0), pixelAt(1, 0), pixelAt(0, 3), pixelAt(1, 3)].map(classify)).toEqual([
      'red',
      'blue',
      'green',
      'white',
    ]);
  });
});
