import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface LinkPreviewRow {
  url: string;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image_path: string | null;
  fetched_at: string;
  error: string | null;
}

const HTML_BYTE_CAP = 512 * 1024;
const IMAGE_BYTE_CAP = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; SortieBot/0.1; +local)';

export function previewDir(): string {
  return path.join(app.getPath('userData'), 'link-previews');
}

export function ensurePreviewDir(): string {
  const dir = previewDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function extractMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    // property="og:title" content="..." OR name="..." content="..."
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)\\s*=\\s*["']${escapeRegex(key)}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escapeRegex(key)}["']`,
        'i',
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return decodeEntities(m[1]).trim();
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || null;
}

async function fetchWithCap(
  url: string,
  byteCap: number,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type');
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf.slice(0, byteCap), contentType };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < byteCap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  try {
    await reader.cancel();
  } catch {
    // body already consumed
  }
  const out = new Uint8Array(Math.min(total, byteCap));
  let offset = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, out.byteLength - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
    if (offset >= out.byteLength) break;
  }
  return { bytes: out, contentType };
}

function extForContentType(ct: string | null): string {
  if (!ct) return 'img';
  const mime = ct.split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/avif') return 'avif';
  return 'img';
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewRow> {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return {
      url,
      title: null,
      description: null,
      site_name: null,
      image_path: null,
      fetched_at: new Date().toISOString(),
      error: 'Invalid URL',
    };
  }

  try {
    const { bytes } = await fetchWithCap(normalized, HTML_BYTE_CAP);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    const title = extractMeta(html, ['og:title', 'twitter:title']) ?? extractTitle(html);
    const description = extractMeta(html, ['og:description', 'twitter:description', 'description']);
    const siteName = extractMeta(html, ['og:site_name']);
    const ogImage = extractMeta(html, ['og:image', 'og:image:url', 'twitter:image']);

    let imagePath: string | null = null;
    if (ogImage) {
      try {
        const absImage = new URL(ogImage, normalized).toString();
        const { bytes: imgBytes, contentType } = await fetchWithCap(absImage, IMAGE_BYTE_CAP);
        if (imgBytes.byteLength > 0) {
          const dir = ensurePreviewDir();
          const fileName = `${hashUrl(normalized)}.${extForContentType(contentType)}`;
          fs.writeFileSync(path.join(dir, fileName), imgBytes);
          imagePath = fileName;
        }
      } catch (err) {
        console.warn('[linkPreview] image fetch failed:', err);
      }
    }

    return {
      url: normalized,
      title,
      description,
      site_name: siteName,
      image_path: imagePath,
      fetched_at: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url: normalized,
      title: null,
      description: null,
      site_name: null,
      image_path: null,
      fetched_at: new Date().toISOString(),
      error: msg,
    };
  }
}
