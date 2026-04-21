import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { dynamicImport } from '../dynamic-import';
import { resolveImageInput } from '../raw';
import type { OcrBlock, OcrEngine, OcrEngineOptions } from './types';

// Detection is capped to this long-edge so RAM and runtime stay bounded on
// full-resolution photos. PaddleOCR's detection head runs comfortably at this
// size for any text big enough to be selectable.
const DETECT_MAX_DIM = 960;

interface GutenLine {
  text: string;
  mean: number;
  box?: number[][]; // [[x,y],[x,y],[x,y],[x,y]] in the detector's internal coord space
}

// Published @gutenye/ocr-node 1.4.8 internally resizes every input image up
// to the next multiple of 32 before running detection, and the returned box
// coordinates live in that padded pixel space.
const BASE_SIZE = 32;
function ceilToBase(v: number): number {
  return Math.max(Math.ceil(v / BASE_SIZE) * BASE_SIZE, BASE_SIZE);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export class PaddleOcrEngine implements OcrEngine {
  private ocr: any = null;
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
    const mod = await dynamicImport<{ default: any }>('@gutenye/ocr-node');
    const Ocr = mod.default;

    const detectionPath = path.join(this.options.modelsPath, 'detection.onnx');
    const recognitionPath = path.join(this.options.modelsPath, 'recognition.onnx');
    const dictionaryPath = path.join(this.options.modelsPath, 'dictionary.txt');

    this.ocr = await Ocr.create({
      models: { detectionPath, recognitionPath, dictionaryPath },
    });

    this.isInitialized = true;
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
    const written = await sharp(source)
      .rotate()
      .resize(DETECT_MAX_DIM, DETECT_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(tmpPath);
    if (!written.width || !written.height) return [];

    let result: GutenLine[];
    try {
      result = (await this.ocr.detect(tmpPath)) as GutenLine[];
    } finally {
      fs.promises.unlink(tmpPath).catch(() => undefined);
    }

    // Box coords come back in the detector's internal resolution = next
    // multiple of 32 from the PNG we wrote. Normalize against that.
    const W = ceilToBase(written.width);
    const H = ceilToBase(written.height);

    const blocks: OcrBlock[] = [];
    for (const line of result) {
      if (!line.text || !line.box || line.box.length !== 4) continue;
      const text = line.text.trim();
      if (!text) continue;

      const pts = line.box.map(([x, y]) => [x / W, y / H] as [number, number]);
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
