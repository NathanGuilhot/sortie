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
    return this.deps.requireDb().people.getAllPersons();
  }

  async getPersonImages(
    personId: number,
    limit: number = 100,
    offset: number = 0,
  ): Promise<Image[]> {
    const db = this.deps.requireDb();
    const allIds = this.deps.getOrBuildShuffledIds(`person:${personId}`, () =>
      db.people.getPersonImageIds(personId),
    );
    return this.deps.fetchImagesByIdsInOrder(allIds.slice(offset, offset + limit));
  }

  async getPersonThumbnails(personIds: number[]): Promise<Face[]> {
    return this.deps.requireDb().people.getThumbnailFacesForPersons(personIds);
  }

  async renamePerson(personId: number, name: string): Promise<void> {
    this.deps.requireDb().people.updatePersonName(personId, name);
  }

  async mergePersons(keepPersonId: number, mergePersonId: number): Promise<void> {
    this.deps.getFaceMatcher().mergePersons(keepPersonId, mergePersonId);
    this.deps.deleteShuffledIds(`person:${keepPersonId}`, true);
    this.deps.deleteShuffledIds(`person:${mergePersonId}`, true);
  }

  async splitFaceFromPerson(faceId: number): Promise<number> {
    const oldPersonId = this.deps.requireDb().people.getFacePersonId(faceId);
    const newPersonId = this.deps.getFaceMatcher().splitFaceFromPerson(faceId);
    if (oldPersonId !== null) {
      this.deps.deleteShuffledIds(`person:${oldPersonId}`, true);
    }
    this.deps.deleteShuffledIds(`person:${newPersonId}`, true);
    return newPersonId;
  }

  async getImageFaces(imageId: number): Promise<Face[]> {
    return this.deps.requireDb().people.getImageFaces(imageId);
  }

  async setPersonThumbnail(personId: number, faceId: number): Promise<void> {
    this.deps.requireDb().people.updatePersonThumbnail(personId, faceId);
  }

  async deletePerson(personId: number): Promise<void> {
    this.deps.requireDb().people.deletePerson(personId);
    this.deps.deleteShuffledIds(`person:${personId}`, true);
  }
}
