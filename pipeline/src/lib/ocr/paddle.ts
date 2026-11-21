import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { sharp } from '../lazy-modules';
import { dynamicImport } from '../dynamic-import';
import { resolveImageInput } from '../raw';
import { pathToFileURL } from 'url';
import { sortInReadingOrder, type Quad } from './reading-order';
import type { OcrBlock, OcrEngine, OcrEngineOptions } from './types';

// Detection is capped to this long-edge so RAM and runtime stay bounded on
// full-resolution photos. PaddleOCR's detection head runs comfortably at this
// size for any text big enough to be selectable.
const DETECT_MAX_DIM = 960;
// Small images are enlarged up to this factor: detection misses text only a
// few pixels tall.
const MAX_UPSCALE = 2;

interface GutenLine {
  text: string;
  mean: number;
  box: Quad; // in the detector's internal coord space
}

// Same cut-off @gutenye/ocr-common uses to drop unreadable lines.
const MIN_LINE_CONFIDENCE = 0.5;
// Below this, a line is also read upside down, and the better reading wins.
const FLIP_RETRY_BELOW = 0.9;

function side(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Same rule, rounding included, @gutenye/ocr-common uses to turn a line's crop upright. */
function isTallCrop([p0, p1, p2, p3]: Quad): boolean {
  const width = Math.floor(Math.max(side(p0, p1), side(p2, p3)));
  const height = Math.floor(Math.max(side(p0, p3), side(p1, p2)));
  return height / width >= 1.5;
}

/** A line's crop, as @gutenye/ocr-node's ImageRaw. */
interface LineImage {
  data: Uint8Array;
  width: number;
  height: number;
  resize(size: { height: number }): Promise<LineImage>;
}

/** The crop turned upside down: RGBA pixels in reverse order. */
function rotateHalfTurn(image: LineImage): LineImage {
  const { data, width, height } = image;
  const out = new Uint8Array(data.length);
  for (let from = 0, to = data.length - 4; from < data.length; from += 4, to -= 4) {
    out[to] = data[from];
    out[to + 1] = data[from + 1];
    out[to + 2] = data[from + 2];
    out[to + 3] = data[from + 3];
  }
  const ImageRaw = image.constructor as new (raw: {
    data: Uint8Array;
    width: number;
    height: number;
  }) => LineImage;
  return new ImageRaw({ data: out, width, height });
}

// Detection needs sides that are multiples of 32. @gutenye/ocr-node gets
// there by letterboxing the image, which shifts the boxes by an amount it
// doesn't report, so the image we hand it is already sized that way.
const BASE_SIZE = 32;
function ceilToBase(v: number): number {
  return Math.max(Math.ceil(v / BASE_SIZE) * BASE_SIZE, BASE_SIZE);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export class PaddleOcrEngine implements OcrEngine {
  private detection: any = null;
  private recognition: any = null;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly options: OcrEngineOptions) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.doInitialize().catch((err) => {
      this.initializePromise = null;
      throw err;
    });
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    // Loading @gutenye/ocr-node registers its Node backend (sharp, onnxruntime).
    await dynamicImport('@gutenye/ocr-node');
    // Its `Ocr.detect` merges lines whose middles sit at about the same height
    // into one, with a box built from the corners of different lines: on
    // tilted text that box sits between the lines. Run detection and
    // recognition ourselves to keep one block per detected line. The models
    // aren't in the package's exports, so load them by file path.
    const commonEntry = require.resolve('@gutenye/ocr-common');
    const modelsUrl = pathToFileURL(path.join(path.dirname(commonEntry), 'models', 'index.js'));
    const { Detection, Recognition } = await dynamicImport<{ Detection: any; Recognition: any }>(
      modelsUrl.href,
    );

    const models = {
      detectionPath: path.join(this.options.modelsPath, 'detection.onnx'),
      recognitionPath: path.join(this.options.modelsPath, 'recognition.onnx'),
      dictionaryPath: path.join(this.options.modelsPath, 'dictionary.txt'),
    };
    this.detection = await Detection.create({ models });
    this.recognition = await Recognition.create({ models });

    this.isInitialized = true;
  }

  private async readLines(imagePath: string): Promise<GutenLine[]> {
    const lineImages = (await this.detection.run(imagePath)) as Array<{ box: Quad; image: LineImage }>;
    const lines: GutenLine[] = [];
    for (const { box, image } of lineImages) {
      // The crop of a tall box was turned a quarter turn counter-clockwise, so
      // its text runs along the box's right edge: start the quad there.
      const quad = isTallCrop(box) ? [box[1], box[2], box[3], box[0]] : box;
      const line = await this.recognize(image);
      // Detection doesn't know which way up the text is: a line can come out
      // upside down (vertical text read the wrong way, a flipped photo).
      if (!line || line.mean < FLIP_RETRY_BELOW) {
        const flipped = await this.recognize(rotateHalfTurn(image));
        if (flipped && (!line || flipped.mean > line.mean)) {
          lines.push({ ...flipped, box: [quad[2], quad[3], quad[0], quad[1]] });
          continue;
        }
      }
      if (line) lines.push({ ...line, box: quad });
    }
    return sortInReadingOrder(lines.filter((line) => line.mean >= MIN_LINE_CONFIDENCE));
  }

  private async recognize(image: LineImage): Promise<{ text: string; mean: number } | undefined> {
    const resized = await image.resize({ height: 48 });
    const output = await this.recognition.runModel({
      modelData: this.recognition.imageToInput(resized, {}),
    });
    const [line] = this.recognition.decodeText(output) as Array<{ text: string; mean: number }>;
    return line?.text ? line : undefined;
  }

  async extract(input: string | Buffer): Promise<OcrBlock[]> {
    await this.initialize();

    const source = await resolveImageInput(input);

    // Published @gutenye/ocr-node only accepts a file path, so we stage a
    // preprocessed PNG. Unique per-call name prevents two concurrent OCR jobs
    // from trampling each other's input.
    const tmpPath = path.join(
      os.tmpdir(),
      `sortie-ocr-${process.pid}-${crypto.randomBytes(6).toString('hex')}.png`,
    );
    const upright = sharp(source).rotate();
    const { width: srcW, height: srcH, orientation } = await upright.metadata();
    if (!srcW || !srcH) return [];
    // EXIF orientations 5-8 swap width and height once the image is turned upright.
    const [uprightW, uprightH] = (orientation ?? 1) >= 5 ? [srcH, srcW] : [srcW, srcH];
    const scale = Math.min(MAX_UPSCALE, DETECT_MAX_DIM / Math.max(uprightW, uprightH));
    const w = Math.max(1, Math.round(uprightW * scale));
    const h = Math.max(1, Math.round(uprightH * scale));
    // Pad right and bottom with copies of the edge pixels, so box coordinates
    // stay in the scaled image's pixels without stretching it.
    await upright
      .resize(w, h, { fit: 'fill' })
      .extend({ right: ceilToBase(w) - w, bottom: ceilToBase(h) - h, extendWith: 'copy' })
      .png()
      .toFile(tmpPath);

    let result: GutenLine[];
    try {
      result = await this.readLines(tmpPath);
    } finally {
      fs.promises.unlink(tmpPath).catch(() => undefined);
    }

    const blocks: OcrBlock[] = [];
    for (const line of result) {
      const text = line.text.trim();
      if (!text) continue;

      const pts = line.box.map(([x, y]) => [x / w, y / h] as [number, number]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minX = Math.max(0, Math.min(...xs));
      const maxX = Math.min(1, Math.max(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxY = Math.min(1, Math.max(...ys));

      blocks.push({
        text,
        bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        polygon: [pts[0], pts[1], pts[2], pts[3]],
        confidence: line.mean,
      });
    }

    return blocks;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
