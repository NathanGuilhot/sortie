import {
  dotProduct,
  FACE_PHOTOGRAPHIC_MIN_CLIP_MARGIN,
  type FaceScanProgress,
  type Person,
} from 'shared';
import os from 'os';
import sharp from 'sharp';
import { DatabaseManager } from './db';
import { ClipEmbedder } from './clip';
import { type DetectedFace, FaceDetector } from './face';
import { FaceMatcher } from './face-matcher';
import { loadImageInput } from './raw';
import { createSerialQueue, type SerialQueue } from './queue';
import { runWithConcurrency } from './worker-pool';

type FaceCropEmbedding = { embedding: number[]; isPhotographic: boolean } | null;
type DecodedImage = { data: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 };

const FACE_SCAN_CONCURRENCY = Math.min(2, Math.max(1, Math.floor(os.cpus().length / 4)));

export class FaceScanService {
  private faceStyleEmbeddings: Promise<{ photo: number[][]; drawing: number[][] }> | null = null;
  private readonly dbQueue: SerialQueue = createSerialQueue();

  constructor(
    private readonly db: DatabaseManager,
    private readonly faceDetector: FaceDetector,
    private readonly faceMatcher: FaceMatcher,
    private readonly clipEmbedder?: ClipEmbedder,
  ) {}

  async processImage(
    imageId: number,
    filePath: string,
    input?: string | Buffer,
  ): Promise<{ count: number; personIds: number[] }> {
    const faces = await this.faceDetector.detectFaces(filePath, undefined, input);
    const resolvedInput = input ?? (await loadImageInput(filePath));
    const decodedImage = await this.decodeForCrop(resolvedInput);
    const faceCropEmbeddings = decodedImage
      ? await Promise.all(
          faces.map((face) => this.embedFaceCrop(filePath, face.bbox, decodedImage)),
        )
      : faces.map(() => null);

    return await this.dbQueue(() => this.saveDetectedFaces(imageId, faces, faceCropEmbeddings));
  }

  private saveDetectedFaces(
    imageId: number,
    faces: DetectedFace[],
    faceCropEmbeddings: FaceCropEmbedding[],
  ): { count: number; personIds: number[] } {
    if (faces.length === 0) {
      this.db.markImageFacesScanned(imageId);
      return { count: 0, personIds: [] };
    }

    const matches = this.faceMatcher.matchFaces(
      faces.map((face, index) => ({
        descriptor: face.descriptor,
        clipEmbedding: faceCropEmbeddings[index]?.embedding ?? null,
        canGroup: faceCropEmbeddings[index]?.isPhotographic ?? false,
      })),
    );
    const usedPersonIds = new Set<number>();

    for (let index = 0; index < faces.length; index += 1) {
      const face = faces[index];
      const match = matches[index];
      const faceId = this.db.insertFace({
        image_id: imageId,
        person_id: match.personId,
        bbox_x: face.bbox.x,
        bbox_y: face.bbox.y,
        bbox_w: face.bbox.width,
        bbox_h: face.bbox.height,
        confidence: face.confidence,
      });
      this.db.insertFaceEmbedding(faceId, face.descriptor);
      const clipEmbedding = faceCropEmbeddings[index]?.embedding ?? null;
      if (clipEmbedding) {
        this.db.insertFaceClipEmbedding(faceId, clipEmbedding);
      }
      this.faceMatcher.assignFaceToPerson(faceId, match.personId);
      usedPersonIds.add(match.personId);
    }

    for (const personId of usedPersonIds) {
      this.faceMatcher.updatePersonCentroid(personId);
    }

    this.db.markImageFacesScanned(imageId);
    return { count: faces.length, personIds: [...usedPersonIds] };
  }

  private async decodeForCrop(input: string | Buffer): Promise<DecodedImage | null> {
    try {
      const { data, info } = await sharp(input)
        .rotate()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (!info.width || !info.height) return null;
      return { data, width: info.width, height: info.height, channels: info.channels };
    } catch {
      return null;
    }
  }

  private async embedFaceCrop(
    filePath: string,
    bbox: { x: number; y: number; width: number; height: number },
    decoded: DecodedImage,
  ): Promise<{ embedding: number[]; isPhotographic: boolean } | null> {
    if (!this.clipEmbedder) return null;

    try {
      const pad = 0.25;
      const x1 = Math.max(0, Math.min(1, bbox.x - bbox.width * pad));
      const y1 = Math.max(0, Math.min(1, bbox.y - bbox.height * pad));
      const x2 = Math.max(0, Math.min(1, bbox.x + bbox.width * (1 + pad)));
      const y2 = Math.max(0, Math.min(1, bbox.y + bbox.height * (1 + pad)));
      if (x2 <= x1 || y2 <= y1) return null;

      const left = Math.floor(x1 * decoded.width);
      const top = Math.floor(y1 * decoded.height);
      const right = Math.max(left + 1, Math.ceil(x2 * decoded.width));
      const bottom = Math.max(top + 1, Math.ceil(y2 * decoded.height));

      const crop = await sharp(decoded.data, {
        raw: { width: decoded.width, height: decoded.height, channels: decoded.channels },
      })
        .extract({
          left,
          top,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
        })
        .png()
        .toBuffer();
      const embedding = await this.clipEmbedder.embedImage(crop);
      return {
        embedding,
        isPhotographic: await this.isPhotographicFace(embedding),
      };
    } catch (error) {
      console.warn(
        `[face-scan] failed to embed face crop for ${filePath}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  private async isPhotographicFace(embedding: number[]): Promise<boolean> {
    if (!this.clipEmbedder) return false;

    const styleEmbeddings = await this.getFaceStyleEmbeddings();
    const photoScore = Math.max(
      ...styleEmbeddings.photo.map((textEmbedding) => dotProduct(embedding, textEmbedding)),
    );
    const drawingScore = Math.max(
      ...styleEmbeddings.drawing.map((textEmbedding) => dotProduct(embedding, textEmbedding)),
    );
    return photoScore - drawingScore >= FACE_PHOTOGRAPHIC_MIN_CLIP_MARGIN;
  }

  private getFaceStyleEmbeddings(): Promise<{ photo: number[][]; drawing: number[][] }> {
    if (!this.clipEmbedder) {
      return Promise.resolve({ photo: [], drawing: [] });
    }

    this.faceStyleEmbeddings ??= Promise.all([
      Promise.all([
        this.clipEmbedder.embedText('a photo portrait of a real person'),
        this.clipEmbedder.embedText('a close up photograph of a human face'),
      ]),
      Promise.all([
        this.clipEmbedder.embedText('an anime drawing of a face'),
        this.clipEmbedder.embedText('a cartoon illustration of a face'),
        this.clipEmbedder.embedText('a manga drawing of a character face'),
      ]),
    ]).then(([photo, drawing]) => ({ photo, drawing }));

    return this.faceStyleEmbeddings;
  }

  async processPendingImages(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ scanned: number; detected: number; cancelled: boolean; personIds: number[] }> {
    const images = this.db.getUnscannedFaceImages();
    const updatedPersonIds = new Set<number>();
    let totalFaces = 0;
    let scanned = 0;

    const { cancelled } = await runWithConcurrency(
      images,
      FACE_SCAN_CONCURRENCY,
      async (image) => {
        let personIds: number[] = [];
        try {
          const result = await this.processImage(image.id, image.file_path);
          totalFaces += result.count;
          personIds = result.personIds;
        } catch (error) {
          console.error(`Failed face detection for ${image.file_path}:`, error);
          await this.dbQueue(() => this.db.markImageFacesScanned(image.id));
        }

        for (const personId of personIds) {
          updatedPersonIds.add(personId);
        }

        const personUpdates = personIds
          .map((personId) => this.db.getPersonById(personId))
          .filter((person): person is Person => person !== null);
        scanned += 1;
        onProgress?.({
          current: scanned,
          total: images.length,
          currentFile: image.file_path,
          personUpdates,
        });
      },
      signal,
    );

    return {
      scanned,
      detected: totalFaces,
      cancelled,
      personIds: [...updatedPersonIds],
    };
  }
}
