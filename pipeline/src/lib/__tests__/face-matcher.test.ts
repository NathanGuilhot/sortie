import { describe, expect, it } from 'vitest';
import { FACE_CLIP_MATCH_THRESHOLD } from 'shared';
import { FaceMatcher } from '../face-matcher';

type NearestRow = { rowid: number; distance: number };

function createMatcher(options: {
  nearestFaceClips: NearestRow[];
  nearestFaces?: NearestRow[];
  facePersons: Map<number, number | null>;
  personClipEmbeddings?: Map<number, number[][]>;
}) {
  let nextPersonId = 100;
  const insertedPersons: number[] = [];

  const people = {
    findNearestFaceClip: () => options.nearestFaceClips,
    findNearestFace: () => options.nearestFaces ?? options.nearestFaceClips,
    getPersonFaceClipEmbeddings: (personId: number) =>
      options.personClipEmbeddings?.get(personId) ?? [],
    getFacePersonId: (faceId: number) => options.facePersons.get(faceId) ?? null,
    insertPerson: () => {
      const id = nextPersonId++;
      insertedPersons.push(id);
      return id;
    },
    insertPersonEmbedding: () => undefined,
  };

  const db = { people };

  return {
    matcher: new FaceMatcher(db as never),
    insertedPersons,
  };
}

describe('FaceMatcher', () => {
  const descriptor = Array.from({ length: 128 }, (_, index) => (index === 0 ? 1 : 0));
  const clipEmbedding = Array.from({ length: 512 }, (_, index) => (index === 0 ? 1 : 0));

  it('creates a new person when no face-crop CLIP embedding is available', () => {
    const { matcher, insertedPersons } = createMatcher({
      nearestFaceClips: [{ rowid: 1, distance: 0.01 }],
      facePersons: new Map([[1, 7]]),
      personClipEmbeddings: new Map([[7, [clipEmbedding]]]),
    });

    const match = matcher.matchFace(descriptor);

    expect(match.isNewPerson).toBe(true);
    expect(match.personId).toBe(insertedPersons[0]);
  });

  it('creates a new person when the nearest known face crop is outside the strict threshold', () => {
    expect(FACE_CLIP_MATCH_THRESHOLD).toBeLessThan(0.25);

    const { matcher, insertedPersons } = createMatcher({
      nearestFaceClips: [{ rowid: 1, distance: 0.28 }],
      facePersons: new Map([[1, 7]]),
      personClipEmbeddings: new Map([[7, [clipEmbedding]]]),
    });

    const match = matcher.matchFace({ descriptor, clipEmbedding });

    expect(match.isNewPerson).toBe(true);
    expect(match.personId).toBe(insertedPersons[0]);
  });

  it('matches through the nearest cohesive face-crop exemplar for a person', () => {
    const { matcher } = createMatcher({
      nearestFaceClips: [
        { rowid: 1, distance: 0.12 },
        { rowid: 2, distance: 0.17 },
      ],
      facePersons: new Map([
        [1, 7],
        [2, 8],
      ]),
      personClipEmbeddings: new Map([
        [7, [clipEmbedding]],
        [8, [clipEmbedding]],
      ]),
    });

    const match = matcher.matchFace({ descriptor, clipEmbedding });

    expect(match).toEqual({ personId: 7, distance: 0.12, isNewPerson: false });
  });

  it('rejects a CLIP-only style match without nearby face descriptor evidence', () => {
    const { matcher, insertedPersons } = createMatcher({
      nearestFaceClips: [{ rowid: 1, distance: 0.12 }],
      nearestFaces: [{ rowid: 1, distance: 0.22 }],
      facePersons: new Map([[1, 7]]),
      personClipEmbeddings: new Map([[7, [clipEmbedding]]]),
    });

    const match = matcher.matchFace({ descriptor, clipEmbedding });

    expect(match.isNewPerson).toBe(true);
    expect(match.personId).toBe(insertedPersons[0]);
  });

  it('does not group non-photographic face crops', () => {
    const { matcher, insertedPersons } = createMatcher({
      nearestFaceClips: [{ rowid: 1, distance: 0.01 }],
      facePersons: new Map([[1, 7]]),
      personClipEmbeddings: new Map([[7, [clipEmbedding]]]),
    });

    const match = matcher.matchFace({ descriptor, clipEmbedding, canGroup: false });

    expect(match.isNewPerson).toBe(true);
    expect(match.personId).toBe(insertedPersons[0]);
  });

  it('rejects a nearby exemplar when the full cluster is not cohesive', () => {
    const farFromQuery = Array.from({ length: 512 }, (_, index) => (index === 1 ? 1 : 0));
    const { matcher, insertedPersons } = createMatcher({
      nearestFaceClips: [{ rowid: 1, distance: 0.12 }],
      facePersons: new Map([[1, 7]]),
      personClipEmbeddings: new Map([[7, [clipEmbedding, farFromQuery]]]),
    });

    const match = matcher.matchFace({ descriptor, clipEmbedding });

    expect(match.isNewPerson).toBe(true);
    expect(match.personId).toBe(insertedPersons[0]);
  });
});
