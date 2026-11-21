import { describe, expect, it } from 'vitest';
import { matchOcrText, ocrQueryWords, parseSearchText } from '../ocr-text-search';
import { hasScoredSearchDimension } from '../search-query';

const blocks = (...texts: string[]) => texts.map((text, index) => ({ text, index }));

describe('parseSearchText', () => {
  it('splits quoted phrases from the rest', () => {
    expect(parseSearchText('poster "big sale"')).toEqual({ phrases: ['big sale'], rest: 'poster' });
    expect(parseSearchText('“open  late”')).toEqual({ phrases: ['open late'], rest: '' });
    expect(parseSearchText('"a" "b" c')).toEqual({ phrases: ['a', 'b'], rest: 'c' });
  });

  it('drops empty phrases and stray quotes', () => {
    expect(parseSearchText('""')).toEqual({ phrases: [], rest: '' });
    expect(parseSearchText('"sale')).toEqual({ phrases: [], rest: 'sale' });
  });

  it('does not treat a lone pair of empty quotes as a search', () => {
    expect(hasScoredSearchDimension({ text: '""' })).toBe(false);
    expect(hasScoredSearchDimension({ text: '"sale"' })).toBe(true);
  });
});

describe('ocrQueryWords', () => {
  it('keeps words of three letters or more, folded', () => {
    expect(ocrQueryWords('a Cat holding a SIGN')).toEqual(['cat', 'holding', 'sign']);
  });

  it('falls back to two-letter words when nothing longer is there', () => {
    expect(ocrQueryWords('4k a')).toEqual(['4k']);
  });
});

describe('matchOcrText', () => {
  it('matches a quoted phrase inside a word, ignoring case and accents', () => {
    expect(matchOcrText(blocks('Grand CAFÉ de Paris'), parseSearchText('"cafe"'))).toEqual([
      { block: 0, start: 6, end: 10 },
    ]);
    expect(matchOcrText(blocks('Cafeteria'), parseSearchText('"cafe"'))).toEqual([
      { block: 0, start: 0, end: 4 },
    ]);
  });

  it('requires whole words without quotes for words under five letters', () => {
    expect(matchOcrText(blocks('Location'), parseSearchText('cat'))).toBeNull();
    expect(matchOcrText(blocks('My cat, Tom'), parseSearchText('cat'))).toEqual([
      { block: 0, start: 3, end: 6 },
    ]);
  });

  it('finds longer words inside text OCR glued together', () => {
    expect(matchOcrText(blocks('We liveincapitalism'), parseSearchText('capitalism'))).toEqual([
      { block: 0, start: 9, end: 19 },
    ]);
  });

  it('needs every word or phrase', () => {
    expect(matchOcrText(blocks('open now'), parseSearchText('open late'))).toBeNull();
    expect(matchOcrText(blocks('late', 'open'), parseSearchText('open late'))).toEqual([
      { block: 0, start: 0, end: 4 },
      { block: 1, start: 0, end: 4 },
    ]);
  });

  it('matches a phrase that runs across two blocks', () => {
    expect(matchOcrText(blocks('OPEN', 'LATE today'), parseSearchText('"open late"'))).toEqual([
      { block: 0, start: 0, end: 4 },
      { block: 1, start: 0, end: 4 },
    ]);
  });

  it('keeps offsets in the original text when folding changes length', () => {
    const decomposed = 'Café ok';
    expect(matchOcrText(blocks(decomposed), parseSearchText('"ok"'))).toEqual([
      { block: 0, start: 6, end: 8 },
    ]);
  });

  it('keeps Hangul and Devanagari intact', () => {
    expect(matchOcrText(blocks('서울 카페'), parseSearchText('"카페"'))).toEqual([
      { block: 0, start: 3, end: 5 },
    ]);
    expect(matchOcrText(blocks('नमस्ते दुनिया'), parseSearchText('"नमस्ते"'))).toEqual([
      { block: 0, start: 0, end: 6 },
    ]);
  });

  it('folds text and query the same way, final sigma included', () => {
    expect(matchOcrText(blocks('ΚΑΦΕΣ'), parseSearchText('"καφες"'))).not.toBeNull();
    expect(matchOcrText(blocks('καφες'), parseSearchText('"ΚΑΦΕΣ"'))).not.toBeNull();
  });

  it('returns every occurrence', () => {
    expect(matchOcrText(blocks('sale sale'), parseSearchText('"sale"'))).toEqual([
      { block: 0, start: 0, end: 4 },
      { block: 0, start: 5, end: 9 },
    ]);
  });
});
