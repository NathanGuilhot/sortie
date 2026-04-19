import { PinterestResult } from 'shared';

interface PinImageOrig {
  url?: string;
  width?: number;
  height?: number;
}

interface RawPin {
  id?: string;
  type?: string;
  link?: string | null;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  auto_alt_text?: string | null;
  alt_text?: string | null;
  videos?: unknown;
  images?: { orig?: PinImageOrig };
  // Pinterest's AI-generated flag: absent on normal pins, numeric code on
  // AI-labelled pins (16 = "Generative AI" label, 11 = rarer AI-adjacent).
  digital_media_source_type?: number | null;
}

// Pinterest uses this sentinel for user-uploaded pins that have no source URL.
const NO_LINK_SENTINEL = 'uploaded by user';

function cleanString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickDescription(p: RawPin): string | null {
  return (
    cleanString(p.description) ??
    cleanString(p.title) ??
    cleanString(p.auto_alt_text) ??
    cleanString(p.alt_text)
  );
}

function pickAlt(p: RawPin): string | null {
  return cleanString(p.auto_alt_text) ?? cleanString(p.alt_text) ?? cleanString(p.title);
}

function deriveDomainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    return host || null;
  } catch {
    return null;
  }
}

export function parsePin(raw: unknown): PinterestResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as RawPin;

  // Skip videos in v1 — they need HLS handling we haven't built.
  if (p.videos) return null;

  const orig = p.images?.orig;
  if (!orig?.url || typeof orig.url !== 'string') return null;
  if (typeof p.id !== 'string' || !p.id) return null;

  const width = typeof orig.width === 'number' ? orig.width : 0;
  const height = typeof orig.height === 'number' ? orig.height : 0;
  if (width <= 0 || height <= 0) return null;

  // `link` is the source of truth for the pin's source URL. `domain` is just
  // a label Pinterest provides — and they sometimes use the literal sentinel
  // "Uploaded by user" when a pin was uploaded directly rather than scraped
  // from a website. Trust `link`; only fall back to the domain field when the
  // URL doesn't parse cleanly.
  const sourceUrl = cleanString(p.link);
  const domainRaw = cleanString(p.domain);
  const cleanDomain = domainRaw && domainRaw.toLowerCase() !== NO_LINK_SENTINEL ? domainRaw : null;
  const sourceDomain = sourceUrl ? (deriveDomainFromUrl(sourceUrl) ?? cleanDomain) : null;

  return {
    pinId: p.id,
    imageUrl: orig.url,
    width,
    height,
    alt: pickAlt(p),
    description: pickDescription(p),
    sourceUrl,
    sourceDomain,
    pinUrl: `https://www.pinterest.com/pin/${p.id}/`,
    isAiGenerated: p.digital_media_source_type != null,
  };
}

export function parsePins(raws: unknown[]): PinterestResult[] {
  const out: PinterestResult[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const parsed = parsePin(raw);
    if (!parsed) continue;
    if (seen.has(parsed.pinId)) continue;
    seen.add(parsed.pinId);
    out.push(parsed);
  }
  return out;
}
