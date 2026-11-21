// Only matches absolute http(s) URLs: relative paths in photos are almost
// never meaningful and would false-positive on every "word.word" token.
const URL_RE = /\bhttps?:\/\/[^\s<>"'()一-鿿]+/gi;

export interface OcrTextSegment {
  text: string;
  url: string | null;
  highlighted: boolean;
}

/** Splits text at link and highlight edges, so each piece is one or the other, or both. */
export function splitOcrText(
  text: string,
  highlights: Array<{ start: number; end: number }>,
  findLinks: boolean,
): OcrTextSegment[] {
  const links: Array<{ start: number; end: number; url: string }> = [];
  if (findLinks) {
    for (const match of text.matchAll(URL_RE)) {
      const start = match.index ?? 0;
      links.push({ start, end: start + match[0].length, url: match[0] });
    }
  }
  const cuts = new Set([0, text.length]);
  for (const range of [...links, ...highlights]) {
    cuts.add(Math.max(0, Math.min(range.start, text.length)));
    cuts.add(Math.max(0, Math.min(range.end, text.length)));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const segments: OcrTextSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === end) continue;
    const link = links.find((candidate) => candidate.start <= start && end <= candidate.end);
    segments.push({
      text: text.slice(start, end),
      url: link?.url ?? null,
      highlighted: highlights.some((range) => range.start <= start && end <= range.end),
    });
  }
  return segments;
}
