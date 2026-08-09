import { app } from 'electron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { PinterestImportResult, PinterestResult } from 'shared';
import type { DatabaseService } from '../database';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function getImportFolder(): string {
  return path.join(app.getPath('pictures'), 'Sortie', 'Imports');
}

export async function ensureImportFolder(dbService: DatabaseService): Promise<string> {
  const dir = getImportFolder();
  await fs.mkdir(dir, { recursive: true });
  // Register in folders table so the count rolls up in /folders, but force
  // watched=0 — the importer adds files explicitly. If chokidar were to
  // observe this folder it would call addImage again on the file we just
  // wrote, and addImage's `INSERT OR REPLACE` would delete the row we
  // already populated with description/website_link metadata.
  await dbService.folders.addFolder(dir);
  dbService.folders.setFolderWatched(dir, false);
  return dir;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[mime] ?? null;
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') return '.jpg';
    if (ext === '.png' || ext === '.webp' || ext === '.gif') return ext;
    return null;
  } catch {
    return null;
  }
}

async function downloadImageBytes(
  url: string,
  externalSignal?: AbortSignal,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  // Combine the per-request timeout with any caller-supplied cancel signal
  // (bulk-import jobs pass one so the in-flight download aborts on cancel).
  const signals: AbortSignal[] = [AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)];
  if (externalSignal) signals.push(externalSignal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal,
  });
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  const contentType = res.headers.get('content-type');
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error('Downloaded image was empty');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (${buffer.byteLength} bytes)`);
  }
  return { bytes: buffer, contentType };
}

export interface ImportPinDeps {
  dbService: DatabaseService;
  signal?: AbortSignal;
}

export async function importPin(
  pin: PinterestResult,
  deps: ImportPinDeps,
): Promise<PinterestImportResult> {
  const dir = await ensureImportFolder(deps.dbService);

  // Lock filename on pinId so re-importing the same pin is idempotent.
  const ext = extFromUrl(pin.imageUrl) ?? '.jpg';
  const targetPath = path.join(dir, `pinterest_${pin.pinId}${ext}`);

  // Idempotency: if the file already exists AND the DB knows about it, just return it.
  if (existsSync(targetPath)) {
    const imageId = deps.dbService.images.getImageIdByPath(targetPath);
    if (imageId !== null) {
      return { imageId, filePath: targetPath, alreadyImported: true };
    }
    // File exists on disk but DB row is missing — fall through and re-add.
  }

  const { bytes, contentType } = await downloadImageBytes(pin.imageUrl, deps.signal);

  // If content-type disagrees with URL extension, prefer content-type.
  const ctExt = extFromContentType(contentType);
  let finalPath = targetPath;
  if (ctExt && ctExt !== ext) {
    finalPath = path.join(dir, `pinterest_${pin.pinId}${ctExt}`);
  }

  await fs.writeFile(finalPath, bytes);

  let imageId: number;
  try {
    imageId = (await deps.dbService.images.addImage(finalPath)).imageId;
  } catch (err) {
    // Don't leave an orphan file on disk if DB insert fails.
    try {
      await fs.unlink(finalPath);
    } catch {
      /* ignore */
    }
    throw err;
  }

  // Patch metadata. `description` falls through pin.description → pin.alt so
  // even pins with no real caption still get the auto-alt CV text. `website_link`
  // is only set when Pinterest has a real source URL — we never want to write
  // the pin's own URL there since the user has explicitly asked for the
  // *source* (the original site the image was pinned from).
  const description = pin.description ?? pin.alt;
  const metadata: {
    description?: string;
    website_link?: string | null;
  } = {};
  if (description) metadata.description = description;
  if (pin.sourceUrl) metadata.website_link = pin.sourceUrl;

  if (Object.keys(metadata).length > 0) {
    // Don't swallow failures here — if the patch silently no-ops the user gets
    // an imported image with no description and no link, which looks like a
    // success but isn't. Let it surface so the renderer shows an error.
    await deps.dbService.images.updateImageMetadata(imageId, metadata);
  }

  // Pre-warm the link preview cache so the metadata panel opens with it ready.
  if (pin.sourceUrl) {
    void deps.dbService.images.fetchAndCacheLinkPreview(pin.sourceUrl).catch((err) => {
      console.warn('[pinterest] Link preview prefetch failed:', err);
    });
  }

  return { imageId, filePath: finalPath, alreadyImported: false };
}
