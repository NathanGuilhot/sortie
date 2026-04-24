import type { DatabaseManager, FaceMatcher, FaceScanService } from 'pipeline';
import type { Face, FaceScanProgress, FaceScanResult, Image, Person } from 'shared';

interface DatabasePeopleDeps {
  requireDb(): DatabaseManager;
  getOrBuildShuffledIds(cacheKey: string, loadIds: () => number[]): number[];
  fetchImagesByIdsInOrder(ids: number[]): Image[];
  deleteShuffledIds(prefixOrKey: string, exact?: boolean): void;
  getFaceMatcher(): FaceMatcher;
  getFaceScan(): FaceScanService;
}

export class DatabasePeopleService {
  constructor(private readonly deps: DatabasePeopleDeps) {}

  async processExistingImagesForFaces(
    onProgress?: (progress: FaceScanProgress) => void,
    signal?: AbortSignal,
  ): Promise<FaceScanResult> {
    const result = await this.deps.getFaceScan().processPendingImages(onProgress, signal);

    for (const personId of result.personIds) {
      this.deps.deleteShuffledIds(`person:${personId}`, true);
    }
    this.deps.deleteShuffledIds('person:');

    return {
      scanned: result.scanned,
      detected: result.detected,
      cancelled: result.cancelled,
    };
  }

  async getPersons(): Promise<Person[]> {
    return this.deps.requireDb().getAllPersons();
  }

  async getPersonImages(
    personId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    const db = this.deps.requireDb();
    const allIds = this.deps.getOrBuildShuffledIds(`person:${personId}`, () =>
      db.getPersonImageIds(personId),
    );
    return this.deps.fetchImagesByIdsInOrder(allIds.slice(offset, offset + limit));
  }

  async getPersonThumbnails(personIds: number[]): Promise<Face[]> {
    return this.deps.requireDb().getThumbnailFacesForPersons(personIds);
  }

  async renamePerson(personId: number, name: string): Promise<void> {
    this.deps.requireDb().updatePersonName(personId, name);
  }

  async mergePersons(keepPersonId: number, mergePersonId: number): Promise<void> {
    this.deps.getFaceMatcher().mergePersons(keepPersonId, mergePersonId);
    this.deps.deleteShuffledIds(`person:${keepPersonId}`, true);
    this.deps.deleteShuffledIds(`person:${mergePersonId}`, true);
  }

  async splitFaceFromPerson(faceId: number): Promise<number> {
    return this.deps.getFaceMatcher().splitFaceFromPerson(faceId);
  }

  async getImageFaces(imageId: number): Promise<Face[]> {
    return this.deps.requireDb().getImageFaces(imageId);
  }

  async setPersonThumbnail(personId: number, faceId: number): Promise<void> {
    this.deps.requireDb().updatePersonThumbnail(personId, faceId);
  }

  async deletePerson(personId: number): Promise<void> {
    this.deps.requireDb().deletePerson(personId);
  }
}
