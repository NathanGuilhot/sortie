import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Image } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import * as yauzl from 'yauzl';
import {
  createArchiveEntryName,
  createDefaultArchiveName,
  ensureZipExtension,
  exportBoardZip,
} from '../boardExport';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

async function makeWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-board-export-'));
  temporaryDirectories.push(root);
  return root;
}

function image(id: number, filePath: string): Image {
  return {
    id,
    file_path: filePath,
    file_name: path.basename(filePath),
  } as Image;
}

async function readZip(filePath: string): Promise<Map<string, Buffer>> {
  return await new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('Could not open ZIP'));
        return;
      }
      const entries = new Map<string, Buffer>();
      zipFile.on('error', reject);
      zipFile.on('end', () => resolve(entries));
      zipFile.on('entry', (entry: yauzl.Entry) => {
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`Could not read ${entry.fileName}`));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zipFile.readEntry();
          });
        });
      });
      zipFile.readEntry();
    });
  });
}

describe('board ZIP export', () => {
  it('stores byte-identical originals under names that preserve board order', async () => {
    const root = await makeWorkspace();
    const firstPath = path.join(root, 'café.raw');
    const secondPath = path.join(root, 'photo.gif');
    const firstBytes = Buffer.from([0, 255, 17, 42, 99]);
    const secondBytes = Buffer.from('GIF89a\0exact-source-bytes');
    await fs.writeFile(firstPath, firstBytes);
    await fs.writeFile(secondPath, secondBytes);
    const destinationPath = path.join(root, 'Favorites.zip');
    await fs.writeFile(destinationPath, 'old archive');
    const progress: string[] = [];

    const result = await exportBoardZip({
      images: [image(1, firstPath), image(2, secondPath)],
      destinationPath,
      signal: new AbortController().signal,
      onProgress: ({ currentFile }) => progress.push(currentFile),
    });

    expect(result).toEqual({ status: 'saved', filePath: destinationPath });
    const entries = await readZip(destinationPath);
    expect([...entries.keys()]).toEqual(['001-café.raw', '002-photo.gif']);
    expect(entries.get('001-café.raw')).toEqual(firstBytes);
    expect(entries.get('002-photo.gif')).toEqual(secondBytes);
    expect(progress).toEqual(['café.raw', 'photo.gif']);
  });

  it('reports every unavailable file and does not replace an existing destination', async () => {
    const root = await makeWorkspace();
    const destinationPath = path.join(root, 'Favorites.zip');
    await fs.writeFile(destinationPath, 'existing archive');

    const result = await exportBoardZip({
      images: [image(1, path.join(root, 'missing-one.jpg')), image(2, path.join(root, 'gone.png'))],
      destinationPath,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      status: 'failed',
      failures: [
        { fileName: 'missing-one.jpg', reason: 'File not found' },
        { fileName: 'gone.png', reason: 'File not found' },
      ],
    });
    expect(await fs.readFile(destinationPath, 'utf8')).toBe('existing archive');
  });

  it('removes partial output when cancelled', async () => {
    const root = await makeWorkspace();
    const firstPath = path.join(root, 'one.raw');
    const secondPath = path.join(root, 'two.raw');
    await fs.writeFile(firstPath, Buffer.alloc(1024 * 1024, 1));
    await fs.writeFile(secondPath, Buffer.alloc(1024 * 1024, 2));
    const destinationPath = path.join(root, 'Cancelled.zip');
    await fs.writeFile(destinationPath, 'existing archive');
    const controller = new AbortController();

    const result = await exportBoardZip({
      images: [image(1, firstPath), image(2, secondPath)],
      destinationPath,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    expect(result).toEqual({ status: 'cancelled' });
    expect(await fs.readFile(destinationPath, 'utf8')).toBe('existing archive');
    expect((await fs.readdir(root)).some((name) => name.includes('.sortie-'))).toBe(false);
  });
});

describe('board export naming', () => {
  it('uses stable padding and preserves the original basename', () => {
    expect(createArchiveEntryName(0, 12, 'photo.jpg')).toBe('001-photo.jpg');
    expect(createArchiveEntryName(999, 1000, 'photo.jpg')).toBe('1000-photo.jpg');
    expect(createArchiveEntryName(0, 1, '../nested/photo.jpg')).toBe('001-photo.jpg');
  });

  it('creates a cross-platform-safe default archive name', () => {
    expect(createDefaultArchiveName('Client: Summer / 2026. ')).toBe('Client- Summer - 2026.zip');
    expect(createDefaultArchiveName('...')).toBe('Board.zip');
    expect(ensureZipExtension('/exports/Board')).toBe('/exports/Board.zip');
    expect(ensureZipExtension('/exports/Board.ZIP')).toBe('/exports/Board.ZIP');
  });
});
