import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import type { ImageOrigin } from 'shared';
import { readTags } from './raw';

const execFileAsync = promisify(execFile);

export interface ProvenanceEvidence {
  /** macOS records `[directUrl, referringPage]`; Windows `[hostUrl, referrerUrl]`. */
  whereFroms: string[];
  agent: string | null;
  at: string | null;
  isScreenshot: boolean;
}

export interface OriginInputs {
  hasCameraExif: boolean;
  importedUrl?: string | null;
}

export interface ProvenanceReader {
  read(filePath: string): Promise<ProvenanceEvidence>;
}

export const NO_EVIDENCE: ProvenanceEvidence = {
  whereFroms: [],
  agent: null,
  at: null,
  isScreenshot: false,
};

const MACOS_DATA_PREFIX = '/System/Volumes/Data';

export function normalizeDomain(url: string): string | null {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

// Prefer the referring page over a direct asset URL.
function pickUrl(whereFroms: string[]): string | null {
  const usable = whereFroms.filter((candidate) => normalizeDomain(candidate) !== null);
  if (usable.length === 0) return null;
  return usable[1] ?? usable[0];
}

// Preserve evidence order and never infer origin from filenames.
export function classifyOrigin(evidence: ProvenanceEvidence, inputs: OriginInputs): ImageOrigin {
  if (inputs.importedUrl) {
    return {
      kind: 'imported',
      url: inputs.importedUrl,
      domain: normalizeDomain(inputs.importedUrl),
      at: evidence.at,
    };
  }

  if (evidence.isScreenshot) {
    return { kind: 'screenshot', url: null, domain: null, at: evidence.at };
  }

  const url = pickUrl(evidence.whereFroms);
  if (url) {
    return { kind: 'downloaded', url, domain: normalizeDomain(url), at: evidence.at };
  }

  // Quarantined with no URL still proves it arrived from outside the machine.
  if (evidence.agent) {
    return { kind: 'downloaded', url: null, domain: null, at: evidence.at };
  }

  if (inputs.hasCameraExif) {
    return { kind: 'camera', url: null, domain: null, at: null };
  }

  return { kind: 'unknown', url: null, domain: null, at: null };
}

interface XAttrTags {
  XAttrMDItemWhereFroms?: string | string[];
  XAttrQuarantine?: string;
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  // Avoid splitting commas inside URL query strings.
  return value.split(/,\s*(?=https?:\/\/)/);
}

// `Flags=0081 set at 2026:08:10 21:33:46 by Chrome 128DD19E-...`
function parseQuarantine(value: string | undefined): { agent: string | null; at: string | null } {
  if (!value) return { agent: null, at: null };

  const stamp = value.match(/set at (\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/);
  const at = stamp
    ? new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}`).toISOString()
    : null;

  const by = value.match(/ by (\S+)/);
  return { agent: by ? by[1] : null, at };
}

export async function readMacEvidence(filePath: string): Promise<ProvenanceEvidence> {
  const tags = await readTags<XAttrTags>(filePath, ['-XAttrMDItemWhereFroms', '-XAttrQuarantine']);
  const { agent, at } = parseQuarantine(tags.XAttrQuarantine);
  return { whereFroms: toList(tags.XAttrMDItemWhereFroms), agent, at, isScreenshot: false };
}

// Exiftool does not expose the screenshot marker, so read it directly.
async function isScreenshotFile(filePath: string): Promise<boolean> {
  try {
    await execFileAsync('xattr', ['-p', 'com.apple.metadata:kMDItemIsScreenCapture', filePath]);
    return true;
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    if (/No such xattr|Attribute not found/i.test(stderr)) return false;
    throw error;
  }
}

async function readMacFileEvidence(filePath: string): Promise<ProvenanceEvidence> {
  const [attributes, isScreenshot] = await Promise.all([
    readMacEvidence(filePath),
    isScreenshotFile(filePath),
  ]);
  return { ...attributes, isScreenshot };
}

export async function readFileEvidence(filePath: string): Promise<ProvenanceEvidence> {
  if (process.platform === 'darwin') return await readMacFileEvidence(filePath);
  if (process.platform === 'win32') return await readWindowsEvidence(filePath);
  return NO_EVIDENCE;
}

async function mdfind(folderPath: string, query: string): Promise<string[]> {
  const { stdout } = await execFileAsync('mdfind', ['-onlyin', folderPath, query], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.split('\n').filter(Boolean);
}

function canonicalPath(filePath: string): string {
  return filePath.startsWith(MACOS_DATA_PREFIX)
    ? filePath.slice(MACOS_DATA_PREFIX.length)
    : filePath;
}

async function toPathSet(folderPath: string, query: string): Promise<Set<string>> {
  return new Set((await mdfind(folderPath, query)).map(canonicalPath));
}

// Check coverage with mdfind because mdutil requires elevated privileges.
async function spotlightCoversFolder(folderPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('mdfind', [
      '-onlyin',
      folderPath,
      '-count',
      'kMDItemContentTypeTree == "public.image"',
    ]);
    return Number.parseInt(stdout.trim(), 10) > 0;
  } catch {
    return false;
  }
}

async function createMacReader(folderPath: string): Promise<ProvenanceReader> {
  if (!(await spotlightCoversFolder(folderPath))) {
    return { read: readMacFileEvidence };
  }

  const [withDownloadEvidence, screenshots] = await Promise.all([
    // DownloadedDate also catches quarantine-only downloads.
    toPathSet(folderPath, '(kMDItemWhereFroms == "http*" || kMDItemDownloadedDate == "*")').catch(
      () => null,
    ),
    toPathSet(folderPath, 'kMDItemIsScreenCapture == 1').catch(() => null),
  ]);

  return {
    async read(filePath: string): Promise<ProvenanceEvidence> {
      const canonical = canonicalPath(filePath);
      const [attributes, isScreenshot] = await Promise.all([
        // A failed subset query is not negative evidence.
        withDownloadEvidence === null || withDownloadEvidence.has(canonical)
          ? readMacEvidence(filePath)
          : NO_EVIDENCE,
        screenshots === null
          ? isScreenshotFile(filePath)
          : Promise.resolve(screenshots.has(canonical)),
      ]);
      return { ...attributes, isScreenshot };
    },
  };
}

export function parseZoneIdentifier(content: string): ProvenanceEvidence {
  const read = (key: string): string | null => {
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'im'));
    return match ? match[1].trim() : null;
  };

  const host = read('HostUrl');
  const referrer = read('ReferrerUrl');
  const whereFroms = [host, referrer].filter((value): value is string => Boolean(value));
  // Internet and untrusted zones prove external origin without a URL.
  const zone = read('ZoneId');
  const external = zone === '3' || zone === '4';

  return {
    whereFroms,
    agent: whereFroms.length === 0 && external ? 'browser' : null,
    at: null,
    isScreenshot: false,
  };
}

export async function readWindowsEvidence(filePath: string): Promise<ProvenanceEvidence> {
  try {
    const content = await fs.promises.readFile(`${filePath}:Zone.Identifier`, 'utf8');
    return parseZoneIdentifier(content);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT' || code === 'ENOTDIR') return NO_EVIDENCE;
    throw error;
  }
}

export async function createProvenanceReader(folderPath: string): Promise<ProvenanceReader> {
  if (process.platform === 'darwin') return await createMacReader(folderPath);
  if (process.platform === 'win32') return { read: readWindowsEvidence };
  return { read: async () => NO_EVIDENCE };
}

export async function readImageOrigin(
  filePath: string,
  inputs: OriginInputs,
): Promise<ImageOrigin> {
  return classifyOrigin(await readFileEvidence(filePath), inputs);
}
