import type { FaceScanProgress, Person } from 'shared';
import { DatabaseManager } from './db';
import { FaceDetector } from './face';
import { FaceMatcher } from './face-matcher';

export class FaceScanService {
  constructor(
    private readonly db: DatabaseManager,
    private readonly faceDetector: FaceDetector,
    private readonly faceMatcher: FaceMatcher,
  ) {}

  async processImage(
    imageId: number,
    filePath: string,
    input?: string | Buffer,
  ): Promise<{ count: number; personIds: number[] }> {
    const faces = await this.faceDetector.detectFaces(filePath, undefined, input);
    if (faces.length === 0) {
      this.db.markImageFacesScanned(imageId);
      return { count: 0, personIds: [] };
    }

    const faceIds: number[] = [];
    for (const face of faces) {
      const faceId = this.db.insertFace({
        image_id: imageId,
        person_id: null,
        bbox_x: face.bbox.x,
        bbox_y: face.bbox.y,
        bbox_w: face.bbox.width,
        bbox_h: face.bbox.height,
        confidence: face.confidence,
      });
      this.db.insertFaceEmbedding(faceId, face.descriptor);
      faceIds.push(faceId);
    }

    const matches = this.faceMatcher.matchFaces(faces.map((face) => face.descriptor));
    const usedPersonIds = new Set<number>();
    for (let index = 0; index < faceIds.length; index += 1) {
      const match = matches[index];
      this.faceMatcher.assignFaceToPerson(faceIds[index], match.personId);
      usedPersonIds.add(match.personId);
    }

    for (const personId of usedPersonIds) {
      this.faceMatcher.updatePersonCentroid(personId);
    }

    this.db.markImageFacesScanned(imageId);
    return { count: faces.length, personIds: [...usedPersonIds] };
  }

  async processPendingImages(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ scanned: number; detected: number; cancelled: boolean; personIds: number[] }> {
    const images = this.db.getUnscannedFaceImages();
    const updatedPersonIds = new Set<number>();
    let totalFaces = 0;
    let scanned = 0;
    let cancelled = false;

    for (let index = 0; index < images.length; index += 1) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      const image = images[index];
      let personIds: number[] = [];
      try {
        const result = await this.processImage(image.id, image.file_path);
        totalFaces += result.count;
        personIds = result.personIds;
      } catch (error) {
        console.error(`Failed face detection for ${image.file_path}:`, error);
        this.db.markImageFacesScanned(image.id);
      }

      for (const personId of personIds) {
        updatedPersonIds.add(personId);
      }

      const personUpdates = personIds
        .map((personId) => this.db.getPersonById(personId))
        .filter((person): person is Person => person !== null);
      onProgress?.({
        current: index + 1,
        total: images.length,
        currentFile: image.file_path,
        personUpdates,
      });

      scanned += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return {
      scanned,
      detected: totalFaces,
      cancelled,
      personIds: [...updatedPersonIds],
    };
  }
}
