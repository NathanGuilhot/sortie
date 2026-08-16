import { execFile } from 'child_process';
import nodeFs from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import sharp from 'sharp';
import type { ImageOrigin } from 'shared';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  NO_EVIDENCE,
  classifyOrigin,
  createProvenanceReader,
  normalizeDomain,
  parseZoneIdentifier,
  readWindowsEvidence,
  type OriginInputs,
  type ProvenanceEvidence,
} from '../provenance';
import { shutdownRawLoader } from '../raw';

const execFileAsync = promisify(execFile);
const onMac = process.platform === 'darwin';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

afterAll(async () => {
  await shutdownRawLoader();
});

function evidence(overrides: Partial<ProvenanceEvidence> = {}): ProvenanceEvidence {
  return { ...NO_EVIDENCE, ...overrides };
}

describe('normalizeDomain', () => {
  it('normalizes web hosts and rejects other URLs', () => {
    expect(normalizeDomain('https://WWW.Tumblr.com/post/12')).toBe('tumblr.com');
    expect(normalizeDomain('file:///Users/me/photo.jpg')).toBeNull();
    expect(normalizeDomain('not a url')).toBeNull();
  });
});

describe('classifyOrigin', () => {
  const cases: Array<{
    name: string;
    evidence?: Partial<ProvenanceEvidence>;
    inputs: OriginInputs;
    expected: Partial<ImageOrigin>;
  }> = [
    {
      name: 'prefers a referring page',
      evidence: {
        whereFroms: ['https://cdn.shopify.com/x.jpg', 'https://artist.example/print'],
      },
      inputs: { hasCameraExif: false },
      expected: { kind: 'downloaded', domain: 'artist.example' },
    },
    {
      name: 'falls back to the direct URL',
      evidence: { whereFroms: ['https://i.redd.it/abc.png'] },
      inputs: { hasCameraExif: false },
      expected: { kind: 'downloaded', domain: 'i.redd.it' },
    },
    {
      name: 'recognizes quarantine without a URL',
      evidence: { agent: 'Chrome', at: '2019-03-02T10:00:00.000Z' },
      inputs: { hasCameraExif: false },
      expected: { kind: 'downloaded', domain: null, at: '2019-03-02T10:00:00.000Z' },
    },
    {
      name: 'ranks screenshots above camera EXIF',
      evidence: { isScreenshot: true },
      inputs: { hasCameraExif: true },
      expected: { kind: 'screenshot' },
    },
    {
      name: 'ranks explicit imports above OS evidence',
      evidence: { whereFroms: ['https://i.pinimg.com/x.jpg'] },
      inputs: {
        hasCameraExif: false,
        importedUrl: 'https://www.artstation.com/artwork/abc',
      },
      expected: { kind: 'imported', domain: 'artstation.com' },
    },
    {
      name: 'uses camera EXIF before falling back to unknown',
      inputs: { hasCameraExif: true },
      expected: { kind: 'camera' },
    },
    {
      name: 'returns unknown without evidence',
      inputs: { hasCameraExif: false },
      expected: { kind: 'unknown', url: null, domain: null, at: null },
    },
  ];

  it.each(cases)('$name', ({ evidence: overrides, inputs, expected }) => {
    expect(classifyOrigin(evidence(overrides), inputs)).toMatchObject(expected);
  });
});

describe('parseZoneIdentifier', () => {
  it('keeps both URLs so the referrer can win', () => {
    const parsed = parseZoneIdentifier(
      '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://tumblr.com/post/1\r\nHostUrl=https://64.media.tumblr.com/a.jpg\r\n',
    );

    expect(parsed.whereFroms).toEqual([
      'https://64.media.tumblr.com/a.jpg',
      'https://tumblr.com/post/1',
    ]);
    expect(classifyOrigin(parsed, { hasCameraExif: false }).domain).toBe('tumblr.com');
  });

  it('still proves external origin when only the zone is recorded', () => {
    const parsed = parseZoneIdentifier('[ZoneTransfer]\r\nZoneId=3\r\n');
    expect(parsed.whereFroms).toEqual([]);
    expect(classifyOrigin(parsed, { hasCameraExif: false }).kind).toBe('downloaded');
  });
});

describe('metadata read failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it('treats a missing Windows ADS as successful absence', async () => {
    vi.spyOn(nodeFs.promises, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(readWindowsEvidence('C:\\photos\\plain.jpg')).resolves.toEqual(NO_EVIDENCE);
  });

  it('propagates an unexpected Windows metadata failure', async () => {
    const failure = Object.assign(new Error('access denied'), { code: 'EACCES' });
    vi.spyOn(nodeFs.promises, 'readFile').mockRejectedValueOnce(failure);

    await expect(readWindowsEvidence('C:\\photos\\locked.jpg')).rejects.toBe(failure);
  });
});

describe.runIf(onMac)('reading real macOS extended attributes', () => {
  async function imageWithWhereFroms(urls: string[]): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-provenance-'));
    temporaryDirectories.push(root);
    const filePath = path.join(root, 'saved.jpg');
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#456' } })
      .jpeg()
      .toFile(filePath);

    // Exiftool only decodes this extended attribute in its binary plist form.
    const plistPath = path.join(root, 'wherefroms.plist');
    await fs.writeFile(
      plistPath,
      `<plist version="1.0"><array>${urls
        .map((url) => `<string>${url}</string>`)
        .join('')}</array></plist>`,
    );
    await execFileAsync('plutil', ['-convert', 'binary1', plistPath]);
    const hex = (await fs.readFile(plistPath)).toString('hex');
    await execFileAsync('xattr', ['-wx', 'com.apple.metadata:kMDItemWhereFroms', hex, filePath]);

    return filePath;
  }

  it('reads provenance when Spotlight does not index the folder', async () => {
    const filePath = await imageWithWhereFroms([
      'https://64.media.tumblr.com/abc/photo.jpg',
      'https://staff.tumblr.com/post/12345',
    ]);
    const reader = await createProvenanceReader(path.dirname(filePath));

    const origin = classifyOrigin(await reader.read(filePath), { hasCameraExif: false });

    expect(origin).toMatchObject({ kind: 'downloaded', domain: 'staff.tumblr.com' });
  }, 30_000);
});
