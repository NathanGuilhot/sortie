import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, seedImage, type TestDb } from '../testing/test-db';

const baseImage = {
  file_path: '/foo/bar/x.jpg',
  file_name: 'x.jpg',
  file_size: 1000,
  mime_type: 'image/jpeg',
  width: 100,
  height: 100,
  captured_at: null,
  latitude: null,
  longitude: null,
  city: null,
  country: null,
  description: null,
  favorite: false,
  hidden: false,
  missing: false,
  file_hash: 'hash-v1',
  dhash: null,
};

const downloaded = {
  origin_kind: 'downloaded' as const,
  origin_domain: 'tumblr.com',
  origin_at: '2016-06-01T00:00:00.000Z',
  website_link: 'https://tumblr.com/post/1',
};

describe('provenance persistence', () => {
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  function linkRow(id: number) {
    return testDb.raw
      .prepare(
        'SELECT origin_kind, origin_domain, origin_at, website_link, website_link_source FROM images WHERE id = ?',
      )
      .get(id) as {
      origin_kind: string | null;
      origin_domain: string | null;
      origin_at: string | null;
      website_link: string | null;
      website_link_source: string | null;
    };
  }

  it('records and refreshes inferred links', () => {
    const { id } = testDb.manager.images.upsertImage({ ...baseImage, ...downloaded });

    expect(linkRow(id)).toMatchObject({
      origin_domain: 'tumblr.com',
      website_link: 'https://tumblr.com/post/1',
      website_link_source: 'inferred',
    });

    testDb.manager.images.upsertImage({
      ...baseImage,
      file_hash: 'hash-v2',
      origin_kind: 'downloaded',
      origin_domain: 'reddit.com',
      origin_at: '2017-01-01T00:00:00.000Z',
      website_link: 'https://reddit.com/r/art/1',
    });

    expect(linkRow(id)).toMatchObject({
      origin_domain: 'reddit.com',
      website_link: 'https://reddit.com/r/art/1',
      website_link_source: 'inferred',
    });
  });

  it('never overwrites a link the user typed', () => {
    const { id } = testDb.manager.images.upsertImage({ ...baseImage, ...downloaded });
    testDb.manager.images.updateImageMetadata(id, { website_link: 'https://artist.example/print' });

    testDb.manager.images.upsertImage({
      ...baseImage,
      file_hash: 'hash-v2',
      origin_kind: 'downloaded',
      origin_domain: 'reddit.com',
      origin_at: '2017-01-01T00:00:00.000Z',
      website_link: 'https://reddit.com/r/art/1',
    });

    expect(linkRow(id)).toMatchObject({
      origin_domain: 'reddit.com',
      website_link: 'https://artist.example/print',
      website_link_source: 'user',
    });
  });

  it('clears an inferred link when the new origin carries no URL', () => {
    const { id } = testDb.manager.images.upsertImage({ ...baseImage, ...downloaded });

    testDb.manager.images.upsertImage({
      ...baseImage,
      file_hash: 'hash-v2',
      origin_kind: 'screenshot',
      origin_domain: null,
      origin_at: null,
      website_link: null,
    });

    expect(linkRow(id)).toMatchObject({
      origin_kind: 'screenshot',
      website_link: null,
      website_link_source: 'inferred',
    });
  });

  it('leaves a failed provenance read pending for retry', () => {
    const { id } = testDb.manager.images.upsertImage({ ...baseImage, ...downloaded });

    testDb.manager.images.upsertImage({
      ...baseImage,
      file_hash: 'hash-v2',
      origin_kind: null,
      origin_domain: null,
      origin_at: null,
      website_link: null,
    });

    expect(linkRow(id)).toMatchObject({
      origin_kind: null,
      origin_domain: null,
      origin_at: null,
      website_link: 'https://tumblr.com/post/1',
      website_link_source: 'inferred',
    });
    expect(testDb.manager.images.listImagesMissingOrigin()).toEqual([
      { id, file_path: baseImage.file_path },
    ]);
  });

  it('queues only unexamined images until they are classified', () => {
    const pending = seedImage(testDb, '/photos/pending.jpg');
    seedImage(testDb, '/photos/done.jpg', { originKind: 'unknown' });
    seedImage(testDb, '/photos/classified.jpg', { originKind: 'camera' });
    seedImage(testDb, '/photos/gone.jpg', { missing: true });

    expect(testDb.manager.images.listImagesMissingOrigin().map((row) => row.id)).toEqual([pending]);

    testDb.manager.images.setImageOrigin(pending, {
      origin_kind: 'unknown',
      origin_domain: null,
      origin_at: null,
      website_link: null,
    });

    expect(testDb.manager.images.listImagesMissingOrigin()).toEqual([]);
  });
});
