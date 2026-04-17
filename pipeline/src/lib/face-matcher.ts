import { FACE_MATCH_THRESHOLD } from 'shared';
import { DatabaseManager } from './db';
import { normalizeVector } from 'shared';

export interface MatchResult {
  personId: number;
  distance: number;
  isNewPerson: boolean;
}

export class FaceMatcher {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  matchFace(descriptor: number[]): MatchResult {
    const nearest = this.db.findNearestPerson(descriptor, 1);

    if (nearest.length > 0 && nearest[0].distance < FACE_MATCH_THRESHOLD) {
      return {
        personId: nearest[0].rowid,
        distance: nearest[0].distance,
        isNewPerson: false,
      };
    }

    const personId = this.db.insertPerson(null);
    this.db.insertPersonEmbedding(personId, descriptor);
    return { personId, distance: 0, isNewPerson: true };
  }

  assignFaceToPerson(faceId: number, personId: number): void {
    this.db.updateFacePerson(faceId, personId);
    this.updatePersonCentroid(personId);
    this.db.updatePersonFaceCount(personId);

    const person = this.db.getPersonById(personId);
    if (person && person.thumbnail_face_id === null) {
      this.db.updatePersonThumbnail(personId, faceId);
    }
  }

  updatePersonCentroid(personId: number): void {
    const faces = this.db.getPersonFaces(personId);
    if (faces.length === 0) return;

    const dim = faces.length > 0 ? 128 : 0;
    const centroid = new Array<number>(dim).fill(0);

    for (const face of faces) {
      const embedding = this.db.getFaceEmbedding(face.id);
      if (!embedding) continue;
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= faces.length;
    }

    this.db.insertPersonEmbedding(personId, normalizeVector(centroid));
  }

  mergePersons(keepPersonId: number, mergePersonId: number): void {
    const mergeFaces = this.db.getPersonFaces(mergePersonId);
    for (const face of mergeFaces) {
      this.db.updateFacePerson(face.id, keepPersonId);
    }

    this.updatePersonCentroid(keepPersonId);
    this.db.updatePersonFaceCount(keepPersonId);
    this.db.deletePerson(mergePersonId);
  }

  splitFaceFromPerson(faceId: number): number {
    const embedding = this.db.getFaceEmbedding(faceId);
    if (!embedding) throw new Error(`No embedding found for face ${faceId}`);

    const faces = this.db.getDatabase().prepare('SELECT person_id FROM faces WHERE id = ?').get(faceId) as
      | { person_id: number | null }
      | undefined;
    const oldPersonId = faces?.person_id;

    const newPersonId = this.db.insertPerson(null);
    this.db.insertPersonEmbedding(newPersonId, embedding);
    this.db.updateFacePerson(faceId, newPersonId);
    this.db.updatePersonThumbnail(newPersonId, faceId);
    this.db.updatePersonFaceCount(newPersonId);

    if (oldPersonId) {
      this.updatePersonCentroid(oldPersonId);
      this.db.updatePersonFaceCount(oldPersonId);
    }

    return newPersonId;
  }
}
