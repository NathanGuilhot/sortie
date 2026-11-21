import { afterEach, describe, expect, it } from 'vitest';
import { runDatabaseMigrations } from '../db-migrations';
import { createTestDb, seedImage, type TestDb } from '../testing/test-db';

const block = (text: string) => ({
  text,
  bbox: { x: 0, y: 0, width: 0.5, height: 0.1 },
  confidence: 0.9,
});

let t: TestDb;
afterEach(() => t?.close());

function find(terms: string[], includeHidden = false): number[] {
  return t.manager.ocr.findImagesWithText(terms, { includeHidden, limit: 100 });
}

describe('OCR text index', () => {
  it('finds saved text, ignoring case and accents, inside words', () => {
    t = createTestDb();
    const cafe = seedImage(t, '/a.jpg');
    const other = seedImage(t, '/b.jpg');
    t.manager.ocr.saveImageOcr(cafe, [block('Grand CAFÉ'), block('de Paris')]);
    t.manager.ocr.saveImageOcr(other, [block('nothing here')]);

    expect(find(['cafe'])).toEqual([cafe]);
    expect(find(['caf'])).toEqual([cafe]);
    expect(find(['cafe', 'paris'])).toEqual([cafe]);
    expect(find(['cafe', 'london'])).toEqual([]);
  });

  it('matches across blocks of the same image', () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    t.manager.ocr.saveImageOcr(id, [block('OPEN'), block('LATE')]);
    expect(find(['open late'])).toEqual([id]);
  });

  it('handles terms shorter than three characters', () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    t.manager.ocr.saveImageOcr(id, [block('4K HDR')]);
    expect(find(['4k'])).toEqual([id]);
    expect(find(['8k'])).toEqual([]);
    expect(find(['50%'])).toEqual([]);
  });

  it('drops the text when OCR is cleared, the file changes or the image is deleted', () => {
    t = createTestDb();
    const a = seedImage(t, '/a.jpg');
    const b = seedImage(t, '/b.jpg');
    const c = seedImage(t, '/c.jpg');
    for (const id of [a, b, c]) t.manager.ocr.saveImageOcr(id, [block('sale')]);

    t.manager.ocr.invalidateImage(a);
    t.raw.prepare('UPDATE images SET ocr_status = NULL WHERE id = ?').run(b);
    t.manager.images.deleteImageRecord(c);

    expect(find(['sale'])).toEqual([]);
  });

  it('replaces the text when OCR runs again', () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    t.manager.ocr.saveImageOcr(id, [block('old')]);
    t.manager.ocr.saveImageOcr(id, [block('new')]);
    expect(find(['old'])).toEqual([]);
    expect(find(['new'])).toEqual([id]);
  });

  it('skips hidden images unless asked, and always skips missing ones', () => {
    t = createTestDb();
    const hidden = seedImage(t, '/h.jpg', { hidden: true });
    const missing = seedImage(t, '/m.jpg', { missing: true });
    t.manager.ocr.saveImageOcr(hidden, [block('sale')]);
    t.manager.ocr.saveImageOcr(missing, [block('sale')]);
    expect(find(['sale'])).toEqual([]);
    expect(find(['sale'], true)).toEqual([hidden]);
  });

  it('escapes quotes in search terms', () => {
    t = createTestDb();
    const id = seedImage(t, '/a.jpg');
    t.manager.ocr.saveImageOcr(id, [block('say "hi" there')]);
    expect(find(['"hi"'])).toEqual([id]);
  });
});

describe('migration 24', () => {
  it('runs OCR again on images the old engine read or found empty, not failed ones', () => {
    t = createTestDb();
    const withText = seedImage(t, '/a.jpg');
    const empty = seedImage(t, '/b.jpg');
    const failed = seedImage(t, '/c.jpg');
    t.manager.ocr.saveImageOcr(withText, [block('old box')]);
    t.manager.ocr.saveImageOcr(empty, []);
    t.manager.ocr.markOcrError(failed, 'broken file');
    t.raw.pragma('user_version = 23');

    runDatabaseMigrations(t.raw, true);

    expect(t.manager.ocr.getOcrStatus(withText).status).toBeNull();
    expect(t.manager.ocr.getImageOcr(withText)).toEqual([]);
    expect(t.manager.ocr.getOcrStatus(empty).status).toBeNull();
    expect(t.manager.ocr.getOcrStatus(failed).status).toBe('error:broken file');
    expect(find(['old'])).toEqual([]);
  });
});
