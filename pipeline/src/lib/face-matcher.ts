import { FACE_MATCH_THRESHOLD, FACE_EMBEDDING_DIM, normalizeVector } from 'shared';
import { DatabaseManager } from './db';
import { hungarian } from './hungarian';

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
    return this.matchFaceExcluding(descriptor, new Set());
  }

  matchFaceExcluding(descriptor: number[], excluded: Set<number>): MatchResult {
    const normed = normalizeVector(descriptor);
    const k = Math.max(10, excluded.size + 5);
    const candidates = this.db.findNearestPerson(normed, k);

    for (const candidate of candidates) {
      if (excluded.has(candidate.rowid)) continue;
      if (candidate.distance >= FACE_MATCH_THRESHOLD) break;
      return {
        personId: candidate.rowid,
        distance: candidate.distance,
        isNewPerson: false,
      };
    }

    const personId = this.db.insertPerson(null);
    this.db.insertPersonEmbedding(personId, normed);
    return { personId, distance: 0, isNewPerson: true };
  }

  /**
   * Optimally assign multiple faces to persons using the Hungarian algorithm.
   * For a single face, falls back to nearest-neighbour matching.
   * Returns one MatchResult per input descriptor (same order).
   */
  matchFaces(descriptors: number[][]): MatchResult[] {
    if (descriptors.length === 0) return [];
    if (descriptors.length === 1) return [this.matchFace(descriptors[0])];

    const normed = descriptors.map((d) => normalizeVector(d));

    // Gather candidate persons for all faces.
    const k = Math.max(10, descriptors.length + 5);
    const personCandidates = new Set<number>();
    const faceCandidateRows: Array<Array<{ rowid: number; distance: number }>> = [];

    for (const desc of normed) {
      const rows = this.db.findNearestPerson(desc, k);
      faceCandidateRows.push(rows);
      for (const row of rows) {
        personCandidates.add(row.rowid);
      }
    }

    // Build the list of candidate person IDs (only those within threshold for
    // at least one face).
    const personIds: number[] = [];
    for (const pid of personCandidates) {
      let withinThreshold = false;
      for (const rows of faceCandidateRows) {
        for (const r of rows) {
          if (r.rowid === pid && r.distance < FACE_MATCH_THRESHOLD) {
            withinThreshold = true;
            break;
          }
        }
        if (withinThreshold) break;
      }
      if (withinThreshold) personIds.push(pid);
    }

    const N = normed.length; // faces (rows)
    const M = personIds.length; // candidate persons (cols)

    if (M === 0) {
      // No existing persons match — create a new person for each face.
      return normed.map((desc) => {
        const personId = this.db.insertPerson(null);
        this.db.insertPersonEmbedding(personId, desc);
        return { personId, distance: 0, isNewPerson: true };
      });
    }

    // Build NxM cost matrix from pre-fetched candidate rows.
    // Distances not found in candidates are set to a large sentinel.
    const SENTINEL = 2.0; // max cosine distance
    const cost: number[][] = [];
    for (let i = 0; i < N; i++) {
      const distMap = new Map<number, number>();
      for (const r of faceCandidateRows[i]) distMap.set(r.rowid, r.distance);
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
      if (j < M && padded[i][j] < FACE_MATCH_THRESHOLD) {
        results[i] = { personId: personIds[j], distance: padded[i][j], isNewPerson: false };
        usedPersonIds.add(personIds[j]);
      } else {
        const personId = this.db.insertPerson(null);
        this.db.insertPersonEmbedding(personId, normed[i]);
        results[i] = { personId, distance: 0, isNewPerson: true };
      }
    }

    return results;
  }

  assignFaceToPerson(faceId: number, personId: number): void {
    this.db.updateFacePerson(faceId, personId);
    this.db.updatePersonFaceCount(personId);

    const person = this.db.getPersonById(personId);
    if (person && person.thumbnail_face_id === null) {
      this.db.updatePersonThumbnail(personId, faceId);
    }
  }

  updatePersonCentroid(personId: number): void {
    const faces = this.db.getPersonFaces(personId);
    if (faces.length === 0) return;

    const centroid = new Array<number>(FACE_EMBEDDING_DIM).fill(0);
    let embeddingCount = 0;

    for (const face of faces) {
      const embedding = this.db.getFaceEmbedding(face.id);
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

    const faces = this.db
      .getDatabase()
      .prepare('SELECT person_id FROM faces WHERE id = ?')
      .get(faceId) as { person_id: number | null } | undefined;
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
