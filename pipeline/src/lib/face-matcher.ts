import {
  cosineDistance,
  FACE_CLIP_CLUSTER_MAX_DISTANCE,
  FACE_CLIP_MATCH_THRESHOLD,
  FACE_EMBEDDING_DIM,
  FACE_MATCH_THRESHOLD,
  normalizeVector,
} from 'shared';
import { DatabaseManager } from './db';
import { hungarian } from './hungarian';

export interface MatchResult {
  personId: number;
  distance: number;
  isNewPerson: boolean;
}

export interface FaceMatchDescriptor {
  descriptor: number[];
  clipEmbedding?: number[] | null;
  canGroup?: boolean;
}

export class FaceMatcher {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  matchFace(descriptor: number[] | FaceMatchDescriptor): MatchResult {
    return this.matchFaceExcluding(descriptor, new Set());
  }

  matchFaceExcluding(
    descriptor: number[] | FaceMatchDescriptor,
    excluded: Set<number>,
  ): MatchResult {
    const face = this.normalizeMatchDescriptor(descriptor);
    const candidates = this.findCandidatePersons(face, Math.max(25, excluded.size + 10));

    for (const candidate of candidates) {
      if (excluded.has(candidate.personId)) continue;
      return {
        personId: candidate.personId,
        distance: candidate.distance,
        isNewPerson: false,
      };
    }

    const personId = this.db.people.insertPerson(null);
    this.db.people.insertPersonEmbedding(personId, face.descriptor);
    return { personId, distance: 0, isNewPerson: true };
  }

  /**
   * Optimally assign multiple faces to persons using the Hungarian algorithm.
   * For a single face, falls back to nearest-neighbour matching.
   * Returns one MatchResult per input descriptor (same order).
   */
  matchFaces(descriptors: Array<number[] | FaceMatchDescriptor>): MatchResult[] {
    if (descriptors.length === 0) return [];
    if (descriptors.length === 1) return [this.matchFace(descriptors[0])];

    const faces = descriptors.map((descriptor) => this.normalizeMatchDescriptor(descriptor));

    const k = Math.max(25, descriptors.length * 5);
    const personCandidates = new Set<number>();
    const faceCandidateRows: Array<Array<{ personId: number; distance: number }>> = [];

    for (const face of faces) {
      const rows = this.findCandidatePersons(face, k);
      faceCandidateRows.push(rows);
      for (const row of rows) {
        personCandidates.add(row.personId);
      }
    }

    // Build the list of candidate person IDs (only those within threshold for
    // at least one face).
    const personIds: number[] = [];
    for (const pid of personCandidates) {
      let withinThreshold = false;
      for (const rows of faceCandidateRows) {
        for (const r of rows) {
          if (r.personId === pid && r.distance < FACE_CLIP_MATCH_THRESHOLD) {
            withinThreshold = true;
            break;
          }
        }
        if (withinThreshold) break;
      }
      if (withinThreshold) personIds.push(pid);
    }

    const N = faces.length; // faces (rows)
    const M = personIds.length; // candidate persons (cols)

    if (M === 0) {
      // No existing persons match: create a new person for each face.
      return faces.map((face) => {
        const personId = this.db.people.insertPerson(null);
        this.db.people.insertPersonEmbedding(personId, face.descriptor);
        return { personId, distance: 0, isNewPerson: true };
      });
    }

    // Build NxM cost matrix from pre-fetched candidate rows.
    // Distances not found in candidates are set to a large sentinel.
    const SENTINEL = 2.0; // max cosine distance
    const cost: number[][] = [];
    for (let i = 0; i < N; i++) {
      const distMap = new Map<number, number>();
      for (const r of faceCandidateRows[i]) {
        const current = distMap.get(r.personId);
        if (current === undefined || r.distance < current) {
          distMap.set(r.personId, r.distance);
        }
      }
      cost.push(personIds.map((pid) => distMap.get(pid) ?? SENTINEL));
    }

    // Solve: find the assignment of faces→persons that minimises total cost.
    // N may exceed M (more faces than known persons); unmatched faces get new
    // persons.  We pad the matrix to square with SENTINEL columns so that
    // the Hungarian algorithm works on an NxN matrix.
    const dim = Math.max(N, M);
    const padded: number[][] = Array.from({ length: dim }, (_, i) =>
      Array.from({ length: dim }, (_, j) => {
        if (i < N && j < M) return cost[i][j];
        return SENTINEL;
      }),
    );

    const assignment = hungarian(padded);

    const results: MatchResult[] = new Array<MatchResult>(N);
    const usedPersonIds = new Set<number>();

    for (let i = 0; i < N; i++) {
      const j = assignment[i];
      if (j < M && padded[i][j] < FACE_CLIP_MATCH_THRESHOLD) {
        results[i] = { personId: personIds[j], distance: padded[i][j], isNewPerson: false };
        usedPersonIds.add(personIds[j]);
      } else {
        const personId = this.db.people.insertPerson(null);
        this.db.people.insertPersonEmbedding(personId, faces[i].descriptor);
        results[i] = { personId, distance: 0, isNewPerson: true };
      }
    }

    return results;
  }

  private findCandidatePersons(
    face: FaceMatchDescriptor,
    limit: number,
  ): Array<{ personId: number; distance: number }> {
    if (face.canGroup === false) return [];
    if (!face.clipEmbedding) return [];
    return this.findClipCandidatePersons(face, limit);
  }

  private findClipCandidatePersons(
    face: FaceMatchDescriptor,
    limit: number,
  ): Array<{ personId: number; distance: number }> {
    const { clipEmbedding } = face;
    if (!clipEmbedding) return [];

    const nearestFaces = this.db.people.findNearestFaceClip(clipEmbedding, limit);
    const nearestDescriptors = this.db.people.findNearestFace(face.descriptor, limit);
    const descriptorDistanceByPerson = new Map<number, number>();

    for (const descriptorFace of nearestDescriptors) {
      if (descriptorFace.distance >= FACE_MATCH_THRESHOLD) break;

      const personId = this.db.people.getFacePersonId(descriptorFace.rowid);
      if (personId === null) continue;

      const current = descriptorDistanceByPerson.get(personId);
      if (current === undefined || descriptorFace.distance < current) {
        descriptorDistanceByPerson.set(personId, descriptorFace.distance);
      }
    }

    const bestByPerson = new Map<number, number>();
    const personEmbeddingsCache = new Map<number, number[][]>();

    for (const clipFace of nearestFaces) {
      if (clipFace.distance >= FACE_CLIP_MATCH_THRESHOLD) break;

      const personId = this.db.people.getFacePersonId(clipFace.rowid);
      if (personId === null) continue;
      if (!descriptorDistanceByPerson.has(personId)) continue;
      if (!this.isCohesiveClipMatch(personId, clipEmbedding, personEmbeddingsCache)) continue;

      const current = bestByPerson.get(personId);
      if (current === undefined || clipFace.distance < current) {
        bestByPerson.set(personId, clipFace.distance);
      }
    }

    return [...bestByPerson.entries()]
      .map(([personId, distance]) => ({ personId, distance }))
      .sort((a, b) => a.distance - b.distance);
  }

  private isCohesiveClipMatch(
    personId: number,
    clipEmbedding: number[],
    cache: Map<number, number[][]>,
  ): boolean {
    let embeddings = cache.get(personId);
    if (!embeddings) {
      embeddings = this.db.people.getPersonFaceClipEmbeddings(personId);
      cache.set(personId, embeddings);
    }
    if (embeddings.length === 0) return false;

    return embeddings.every(
      (embedding) => cosineDistance(clipEmbedding, embedding) < FACE_CLIP_CLUSTER_MAX_DISTANCE,
    );
  }

  private normalizeMatchDescriptor(
    descriptor: number[] | FaceMatchDescriptor,
  ): FaceMatchDescriptor {
    if (Array.isArray(descriptor)) {
      return { descriptor: normalizeVector(descriptor), clipEmbedding: null };
    }

    return {
      descriptor: normalizeVector(descriptor.descriptor),
      clipEmbedding: descriptor.clipEmbedding ? normalizeVector(descriptor.clipEmbedding) : null,
      canGroup: descriptor.canGroup,
    };
  }

  assignFaceToPerson(faceId: number, personId: number): void {
    this.db.people.updateFacePerson(faceId, personId);
    this.db.people.updatePersonFaceCount(personId);

    const person = this.db.people.getPersonById(personId);
    if (person && person.thumbnail_face_id === null) {
      this.db.people.updatePersonThumbnail(personId, faceId);
    }
  }

  updatePersonCentroid(personId: number): void {
    const faces = this.db.people.getPersonFaces(personId);
    if (faces.length === 0) return;

    const centroid = new Array<number>(FACE_EMBEDDING_DIM).fill(0);
    let embeddingCount = 0;

    for (const face of faces) {
      const embedding = this.db.people.getFaceEmbedding(face.id);
      if (!embedding) continue;
      embeddingCount++;
      for (let i = 0; i < FACE_EMBEDDING_DIM; i++) {
        centroid[i] += embedding[i];
      }
    }

    if (embeddingCount === 0) return;

    for (let i = 0; i < FACE_EMBEDDING_DIM; i++) {
      centroid[i] /= embeddingCount;
    }

    this.db.people.insertPersonEmbedding(personId, normalizeVector(centroid));
  }

  mergePersons(keepPersonId: number, mergePersonId: number): void {
    const mergeFaces = this.db.people.getPersonFaces(mergePersonId);
    for (const face of mergeFaces) {
      this.db.people.updateFacePerson(face.id, keepPersonId);
    }

    this.updatePersonCentroid(keepPersonId);
    this.db.people.updatePersonFaceCount(keepPersonId);
    this.db.people.deletePerson(mergePersonId);
  }

  splitFaceFromPerson(faceId: number): number {
    const embedding = this.db.people.getFaceEmbedding(faceId);
    if (!embedding) throw new Error(`No embedding found for face ${faceId}`);

    const oldPersonId = this.db.people.getFacePersonId(faceId);

    const newPersonId = this.db.people.insertPerson(null);
    this.db.people.insertPersonEmbedding(newPersonId, embedding);
    this.db.people.updateFacePerson(faceId, newPersonId);
    this.db.people.updatePersonThumbnail(newPersonId, faceId);
    this.db.people.updatePersonFaceCount(newPersonId);

    if (oldPersonId) {
      this.updatePersonCentroid(oldPersonId);
      this.db.people.updatePersonFaceCount(oldPersonId);
    }

    return newPersonId;
  }
}
