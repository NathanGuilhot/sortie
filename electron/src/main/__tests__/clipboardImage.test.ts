import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { createDisplayOrientedPngBuffer } from '../clipboardImage';

describe('createDisplayOrientedPngBuffer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-clipboard-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function writeJpeg(fileName: string, orientation?: number): Promise<string> {
    const filePath = path.join(tmpDir, fileName);
    const image = sharp({
      create: {
        width: 20,
        height: 30,
        channels: 3,
        background: '#ffffff',
      },
    }).composite([
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#ff0000"/></svg>'),
        left: 0,
        top: 0,
      },
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#00ff00"/></svg>'),
        left: 10,
        top: 0,
      },
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#0000ff"/></svg>'),
        left: 0,
        top: 10,
      },
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#ffffff"/></svg>'),
        left: 10,
        top: 10,
      },
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#000000"/></svg>'),
        left: 0,
        top: 20,
      },
      {
        input: Buffer.from('<svg><rect width="10" height="10" fill="#ffff00"/></svg>'),
        left: 10,
        top: 20,
      },
    ]);

    const withMetadata = orientation ? image.withMetadata({ orientation }) : image;
    await withMetadata.jpeg({ quality: 100 }).toFile(filePath);
    return filePath;
  }

  async function decode(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  function expectColor(
    image: { data: Buffer; width: number },
    x: number,
    y: number,
    expected: [number, number, number],
  ): void {
    const offset = (y * image.width + x) * 3;
    const actual = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
    expect(actual[0]).toBeCloseTo(expected[0], -1);
    expect(actual[1]).toBeCloseTo(expected[1], -1);
    expect(actual[2]).toBeCloseTo(expected[2], -1);
  }

  it('bakes EXIF orientation into the copied PNG pixels', async () => {
    const filePath = await writeJpeg('rotated.jpg', 6);
    const output = await decode(await createDisplayOrientedPngBuffer(filePath));

    expect(output.width).toBe(30);
    expect(output.height).toBe(20);
    expectColor(output, 5, 5, [0, 0, 0]);
    expectColor(output, 15, 5, [0, 0, 255]);
    expectColor(output, 25, 5, [255, 0, 0]);
    expectColor(output, 5, 15, [255, 255, 0]);
    expectColor(output, 15, 15, [255, 255, 255]);
    expectColor(output, 25, 15, [0, 255, 0]);
  });

  it('keeps normal images in their original orientation', async () => {
    const filePath = await writeJpeg('normal.jpg');
    const output = await decode(await createDisplayOrientedPngBuffer(filePath));

    expect(output.width).toBe(20);
    expect(output.height).toBe(30);
    expectColor(output, 5, 5, [255, 0, 0]);
    expectColor(output, 15, 5, [0, 255, 0]);
    expectColor(output, 5, 25, [0, 0, 0]);
    expectColor(output, 15, 25, [255, 255, 0]);
  });
});
