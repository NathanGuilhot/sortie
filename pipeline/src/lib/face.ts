import { FACE_DETECTION_MAX_DIM, FACE_MIN_CONFIDENCE, FACE_MIN_SIZE_RATIO } from 'shared';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { dynamicImport } from './dynamic-import';
import { createSerialQueue, type SerialQueue } from './queue';
import { loadImageInput } from './raw';

export interface DetectedFace {
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  descriptor: number[];
}

interface FaceApiDetection {
  detection: {
    box: { x: number; y: number; width: number; height: number };
    score: number;
  };
  descriptor: Float32Array;
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export class FaceDetector {
  private faceapi: any = null;
  private canvas: any = null;
  private tf: any = null;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private readonly inferenceQueue: SerialQueue = createSerialQueue();
  constructor(
    private readonly modelsPath: string,
    private readonly cacheDir?: string,
  ) {
    if (cacheDir) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (err) {
        console.warn('[face-cache] failed to create cache dir:', err);
      }
    }
  }

  private getCachePath(imagePath: string): string | null {
    if (!this.cacheDir) return null;
    const hash = crypto.createHash('sha256').update(imagePath).digest('hex').slice(0, 16);
    return path.join(this.cacheDir, `${hash}_face.jpg`);
  }

  private isCacheValid(cachePath: string, srcPath: string): boolean {
    try {
      const srcStat = fs.statSync(srcPath);
      const cacheStat = fs.statSync(cachePath);
      return cacheStat.mtimeMs >= srcStat.mtimeMs;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.doInitialize().catch((error) => {
      this.initializePromise = null;
      throw error;
    });
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    const wasmBackend = await dynamicImport<any>('@tensorflow/tfjs-backend-wasm');
    const wasmDir = path.dirname(
      require.resolve('@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm'),
    );
    wasmBackend.setWasmPaths(wasmDir + '/');

    this.tf = await dynamicImport<any>('@tensorflow/tfjs');
    await this.tf.setBackend('wasm');
    await this.tf.ready();

    this.faceapi = await dynamicImport('@vladmandic/face-api/dist/face-api.node-wasm.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.canvas = require('canvas');

    const { Canvas, Image, ImageData } = this.canvas;
    this.faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

    await this.faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsPath);
    await this.faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath);
    await this.faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath);

    this.isInitialized = true;
  }

  async detectFaces(
    imagePath: string,
    minConfidence: number = FACE_MIN_CONFIDENCE,
    input?: string | Buffer,
  ): Promise<DetectedFace[]> {
    await this.initialize();

    const { createCanvas, ImageData } = this.canvas;

    // Try to load from cache (rotated + resized JPEG) to avoid re-reading the full original
    const cachePath = this.getCachePath(imagePath);
    let data: Buffer;
    let canvasWidth: number;
    let canvasHeight: number;

    if (cachePath && this.isCacheValid(cachePath, imagePath)) {
      const result = await sharp(cachePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      data = result.data;
      canvasWidth = result.info.width;
      canvasHeight = result.info.height;
    } else {
      // Only touch loadImageInput on cache miss — a cache hit must never
      // trigger embedded-JPEG extraction for the same file.
      const resolved = input ?? (await loadImageInput(imagePath));
      let pipeline = sharp(resolved).rotate();
      const rotatedMeta = await pipeline.clone().metadata();
      const origW = rotatedMeta.width ?? 0;
      const origH = rotatedMeta.height ?? 0;
      if (origW === 0 || origH === 0) return [];

      if (Math.max(origW, origH) > FACE_DETECTION_MAX_DIM) {
        pipeline = pipeline.resize(FACE_DETECTION_MAX_DIM, FACE_DETECTION_MAX_DIM, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Write to cache before extracting raw pixels
      if (cachePath) {
        try {
          await pipeline.clone().jpeg({ quality: 85 }).toFile(cachePath);
        } catch (err) {
          console.warn('[face-cache] failed to write:', err);
        }
      }

      const result = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      data = result.data;
      canvasWidth = result.info.width;
      canvasHeight = result.info.height;
    }

    const cvs = createCanvas(canvasWidth, canvasHeight);
    const ctx = cvs.getContext('2d');
    const imageData = new ImageData(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      canvasWidth,
      canvasHeight,
    );
    ctx.putImageData(imageData, 0, 0);

    const detections = await this.inferenceQueue(async () => {
      // Scope TF tensors so intermediate allocations are freed after detection.
      this.tf.engine().startScope();
      try {
        return (await this.faceapi
          .detectAllFaces(cvs, new this.faceapi.SsdMobilenetv1Options({ minConfidence }))
          .withFaceLandmarks()
          .withFaceDescriptors()) as FaceApiDetection[];
      } finally {
        this.tf.engine().endScope();
      }
    });

    const minArea = FACE_MIN_SIZE_RATIO * canvasWidth * canvasHeight;

    const results: DetectedFace[] = [];
    for (const detection of detections) {
      const box = detection.detection.box;
      const area = box.width * box.height;
      if (area < minArea) continue;

      results.push({
        bbox: {
          x: box.x / canvasWidth,
          y: box.y / canvasHeight,
          width: box.width / canvasWidth,
          height: box.height / canvasHeight,
        },
        confidence: detection.detection.score,
        descriptor: Array.from(detection.descriptor),
      });
    }

    return results;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
