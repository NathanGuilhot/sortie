import type { OcrTextRange } from './types/ocr';

/**
 * A search bar query split for OCR. Quoted parts are `phrases`: an image
 * matches only if its OCR text contains every phrase. `rest` is the unquoted
 * remainder.
 */
export interface ParsedSearchText {
  phrases: string[];
  rest: string;
}

const QUOTE_CHARS = '"“”';
const PHRASE_RE = new RegExp(`[${QUOTE_CHARS}]([^${QUOTE_CHARS}]*)[${QUOTE_CHARS}]`, 'g');
const STRAY_QUOTE_RE = new RegExp(`[${QUOTE_CHARS}]`, 'g');

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseSearchText(raw: string): ParsedSearchText {
  const phrases: string[] = [];
  const rest = raw.replace(PHRASE_RE, (_match, phrase: string) => {
    const cleaned = collapseSpaces(phrase);
    if (cleaned) phrases.push(cleaned);
    return ' ';
  });
  return { phrases, rest: collapseSpaces(rest.replace(STRAY_QUOTE_RE, ' ')) };
}

export function hasSearchText(parsed: ParsedSearchText): boolean {
  return parsed.phrases.length > 0 || parsed.rest.length > 0;
}

const WORD_RE = /[\p{L}\p{N}]+/gu;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const MIN_WORD_LENGTH = 3;
// OCR often drops the spaces in dense text ("liveincapitalism"), so words this
// long also match inside a longer word. Shorter ones must stand alone, or
// "cat" would match "location".
const MIN_PARTIAL_WORD_LENGTH = 5;

/**
 * Words of the unquoted query an image's text must contain for a text match.
 * Words shorter than three characters are ignored unless they are all there is.
 */
export function ocrQueryWords(rest: string): string[] {
  const words = [...new Set((rest.match(WORD_RE) ?? []).map(foldText))];
  const long = words.filter((word) => word.length >= MIN_WORD_LENGTH);
  return long.length > 0 ? long : words.filter((word) => word.length >= 2);
}

// Latin-style accents only, like SQLite's `remove_diacritics`: stripping every
// combining mark would break scripts whose vowels are marks (Devanagari...).
const ACCENT_RE = /[\u0300-\u036f]/g;

function foldChar(char: string): string {
  // NFC afterwards puts back what NFD split apart for other reasons (Hangul).
  const folded = char.normalize('NFD').replace(ACCENT_RE, '').normalize('NFC').toLowerCase();
  return folded === '\u03C2' ? '\u03C3' : folded; // final sigma ς → σ
}

/**
 * Lowercase and strip accents, so "Café" and "CAFE" compare equal. Folds one
 * character at a time, so text and query fold the same way (Greek final sigma).
 */
function foldText(value: string): string {
  let folded = '';
  for (const char of value) folded += foldChar(char);
  return folded;
}

interface FoldedText {
  text: string;
  /** For each folded character: block index (-1 for a separator) and source span. */
  source: Array<{ block: number; start: number; end: number }>;
}

function foldBlocks(blocks: Array<{ text: string; index: number }>): FoldedText {
  let text = '';
  const source: FoldedText['source'] = [];
  blocks.forEach((block, position) => {
    if (position > 0) {
      text += ' ';
      source.push({ block: -1, start: 0, end: 0 });
    }
    let offset = 0;
    for (const char of block.text) {
      const folded = foldChar(char);
      text += folded;
      for (let i = 0; i < folded.length; i++) {
        source.push({ block: block.index, start: offset, end: offset + char.length });
      }
      offset += char.length;
    }
  });
  return { text, source };
}

function toRanges(folded: FoldedText, start: number, end: number): OcrTextRange[] {
  const ranges: OcrTextRange[] = [];
  for (let i = start; i < end; i++) {
    const source = folded.source[i];
    if (source.block < 0) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.block === source.block) last.end = Math.max(last.end, source.end);
    else ranges.push({ block: source.block, start: source.start, end: source.end });
  }
  return ranges;
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

function isWordAt(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text[start - 1] : '';
  const after = end < text.length ? text[end] : '';
  return !WORD_CHAR_RE.test(before) && !WORD_CHAR_RE.test(after);
}

/**
 * Finds the query in an image's OCR blocks. Returns the matched text ranges,
 * or null when the image doesn't match.
 *
 * - With quoted phrases, every phrase must appear (anywhere, even inside a word).
 * - Otherwise, every word from {@link ocrQueryWords} must appear: as a whole
 *   word if it is shorter than five characters, anywhere otherwise.
 *
 * Blocks are read in order, joined by a space, so a phrase can run across two
 * blocks.
 */
export function matchOcrText(
  blocks: Array<{ text: string; index: number }>,
  parsed: ParsedSearchText,
): OcrTextRange[] | null {
  const needles =
    parsed.phrases.length > 0 ? parsed.phrases.map(foldText) : ocrQueryWords(parsed.rest);
  if (needles.length === 0 || blocks.length === 0) return null;

  const folded = foldBlocks(blocks);
  const wholeWord = (needle: string) =>
    parsed.phrases.length === 0 && [...needle].length < MIN_PARTIAL_WORD_LENGTH;
  const ranges: OcrTextRange[] = [];
  for (const needle of needles) {
    const hits = occurrences(folded.text, needle).filter(
      (start) => !wholeWord(needle) || isWordAt(folded.text, start, start + needle.length),
    );
    if (hits.length === 0) return null;
    for (const start of hits) ranges.push(...toRanges(folded, start, start + needle.length));
  }
  return mergeRanges(ranges);
}

function mergeRanges(ranges: OcrTextRange[]): OcrTextRange[] {
  const sorted = [...ranges].sort((a, b) => a.block - b.block || a.start - b.start);
  const merged: OcrTextRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.block === range.block && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
