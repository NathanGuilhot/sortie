import { FACE_DETECTION_MAX_DIM, FACE_MIN_CONFIDENCE, FACE_MIN_SIZE_RATIO } from 'shared';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface DetectedFace {
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  descriptor: number[];
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export class FaceDetector {
  private faceapi: any = null;
  private canvas: any = null;
  private tf: any = null;
  private isInitialized = false;
  private modelsPath: string;
  private cacheDir?: string;

  constructor(modelsPath: string, cacheDir?: string) {
    this.modelsPath = modelsPath;
    this.cacheDir = cacheDir;
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

    try {
      // Use CPU backend — WASM OOMs inside Electron's process
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const dynamicImport = new Function('specifier', 'return import(specifier)') as <T = unknown>(
        specifier: string,
      ) => Promise<T>;

      // Import TF and force CPU backend before face-api registers its own backend.
      // The WASM backend OOMs inside Electron, so CPU is the safe choice.
      this.tf = await dynamicImport<any>('@tensorflow/tfjs');
      await this.tf.setBackend('cpu');
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
    } catch (error) {
      console.error('Failed to initialize FaceDetector:', error);
      throw error;
    }
  }

  async detectFaces(
    imagePath: string,
    minConfidence: number = FACE_MIN_CONFIDENCE,
  ): Promise<DetectedFace[]> {
    await this.initialize();

    const { createCanvas, ImageData } = this.canvas;

    // Try to load from cache (rotated + resized JPEG) to avoid re-reading the full original
    const cachePath = this.getCachePath(imagePath);
    let data: Buffer;
    let canvasWidth: number;
    let canvasHeight: number;

    if (cachePath && this.isCacheValid(cachePath, imagePath)) {
      const result = await sharp(cachePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      data = result.data;
      canvasWidth = result.info.width;
      canvasHeight = result.info.height;
    } else {
      // Build sharp pipeline: rotate + downscale large images
      let pipeline = sharp(imagePath).rotate();
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

    // Scope TF tensors so intermediate allocations are freed after detection
    this.tf.engine().startScope();
    let detections: any[];
    try {
      detections = await this.faceapi
        .detectAllFaces(cvs, new this.faceapi.SsdMobilenetv1Options({ minConfidence }))
        .withFaceLandmarks()
        .withFaceDescriptors();
    } finally {
      this.tf.engine().endScope();
    }

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
        descriptor: Array.from(detection.descriptor as Float32Array),
      });
    }

    return results;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
