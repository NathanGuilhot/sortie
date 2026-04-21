import path from 'path';
import sharp from 'sharp';
import { ExifTool } from 'exiftool-vendored';

// Camera RAW formats whose pixel data sharp/libvips can't decode. Each file
// contains an embedded full-size JPEG preview (the camera's OOC render), which
// is what we hand downstream instead of demosaicing the sensor data.
const RAW_EXTENSIONS = new Set([
  '.cr2',
  '.cr3',
  '.crw',
  '.nef',
  '.nrw',
  '.arw',
  '.sr2',
  '.srf',
  '.raf',
  '.orf',
  '.rw2',
  '.pef',
  '.dng',
  '.raw',
]);

export function isRawPath(filePath: string): boolean {
  return RAW_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

let toolInstance: ExifTool | null = null;

function tool(): ExifTool {
  if (!toolInstance) {
    toolInstance = new ExifTool({ taskTimeoutMillis: 20_000 });
    const shutdown = () => {
      void toolInstance?.end();
      toolInstance = null;
    };
    process.once('exit', shutdown);
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
  return toolInstance;
}

// Extract the largest embedded JPEG from a RAW file. Tries JpgFromRaw first
// (DSLR convention, full sensor resolution), then PreviewImage (Sony/Fuji and
// many others), then ThumbnailImage as last resort. Throws if none present —
// caller decides how to handle.
async function extractEmbeddedJpeg(filePath: string): Promise<Buffer> {
  const t = tool();
  const tags: ReadonlyArray<'JpgFromRaw' | 'PreviewImage' | 'ThumbnailImage'> = [
    'JpgFromRaw',
    'PreviewImage',
    'ThumbnailImage',
  ];
  for (const tag of tags) {
    try {
      const buf = await t.extractBinaryTagToBuffer(tag, filePath);
      if (buf && buf.length > 0) return buf;
    } catch {
      // try next tag
    }
  }
  throw new Error(`no embedded JPEG preview in ${filePath}`);
}

// Sony ARW, Fuji RAF and some older ORFs store the embedded preview as
// sensor-native pixels with no EXIF Orientation of their own — the rotation
// lives only on the RAW container. Returns the orientation EXIF viewers
// should apply (1 when already correct, 2–8 otherwise). Uses aspect-ratio
// agreement to detect previews that are already pre-rotated (Canon/Nikon),
// in which case we trust the preview's own tag.
async function resolveOrientation(buf: Buffer, filePath: string): Promise<number> {
  const meta = await sharp(buf).metadata();
  if (meta.orientation && meta.orientation !== 1) return meta.orientation;

  const t = tool();
  const tags = (await t.read(filePath)) as {
    Orientation?: number;
    ImageWidth?: number;
    ImageHeight?: number;
  };
  const containerOrientation = typeof tags.Orientation === 'number' ? tags.Orientation : 1;
  if (containerOrientation === 1) return 1;

  const rawW = tags.ImageWidth ?? 0;
  const rawH = tags.ImageHeight ?? 0;
  const prevW = meta.width ?? 0;
  const prevH = meta.height ?? 0;
  if (rawW && rawH && prevW && prevH && rawW > rawH !== prevW > prevH) {
    // Preview aspect disagrees with sensor aspect → preview pixels are
    // already oriented for display; applying containerOrientation would
    // double-rotate.
    return 1;
  }

  return containerOrientation;
}

// Normalize any image path to something sharp can decode. Non-RAW paths are
// returned verbatim (sharp opens them directly); RAW paths resolve to a Buffer
// whose pixels are already rotated for display and whose EXIF Orientation is
// stripped. Baking the rotation here means downstream callers don't need to
// remember `.rotate()` — one forgotten call used to produce wrong-oriented
// thumbnails for cameras (Sony ARW, Fuji RAF) whose embedded preview lacks
// its own orientation tag.
export async function loadImageInput(filePath: string): Promise<string | Buffer> {
  if (!isRawPath(filePath)) return filePath;
  const raw = await extractEmbeddedJpeg(filePath);
  const orientation = await resolveOrientation(raw, filePath);
  if (orientation === 1) return raw;
  return await sharp(raw).withMetadata({ orientation }).rotate().toBuffer();
}

// Convenience for callers that already accept `string | Buffer` inputs and
// only need RAW normalization on the path branch.
export async function resolveImageInput(input: string | Buffer): Promise<string | Buffer> {
  return typeof input === 'string' ? await loadImageInput(input) : input;
}

export async function shutdownRawLoader(): Promise<void> {
  if (toolInstance) {
    await toolInstance.end();
    toolInstance = null;
  }
}
