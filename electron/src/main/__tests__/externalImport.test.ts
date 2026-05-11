import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IPC_EVENTS } from 'shared';
import {
  collectImagePaths,
  ExternalImportService,
  normalizeExternalImportPath,
  parseExternalImportArgs,
} from '../externalImport';

describe('external import parsing', () => {
  it('parses explicit action args and paths', () => {
    expect(
      parseExternalImportArgs([
        '/Applications/Sortie.app/Contents/MacOS/Sortie',
        '--sortie-action=add-to-board',
        '/tmp/a.jpg',
        '/tmp/b.png',
      ]),
    ).toEqual({
      action: 'add-to-board',
      paths: ['/tmp/a.jpg', '/tmp/b.png'],
    });
  });

  it('parses cold-launch action args with paths containing spaces', () => {
    expect(
      parseExternalImportArgs([
        '/Applications/Sortie.app/Contents/MacOS/Sortie',
        '--sortie-action',
        'add-images-to-gallery',
        '/Users/nathanguilhot/Desktop/First Image.jpg',
        '/Users/nathanguilhot/Desktop/Second Image.png',
      ]),
    ).toEqual({
      action: 'add-images-to-gallery',
      paths: [
        '/Users/nathanguilhot/Desktop/First Image.jpg',
        '/Users/nathanguilhot/Desktop/Second Image.png',
      ],
    });
  });

  it('normalizes singular folder action alias', () => {
    expect(
      parseExternalImportArgs([
        'Sortie.exe',
        '--sortie-action',
        'add-folder-to-gallery',
        'C:\\Photos',
      ]),
    ).toEqual({
      action: 'add-folders-to-gallery',
      paths: ['C:\\Photos'],
    });
  });

  it('parses protocol invocations', () => {
    expect(
      parseExternalImportArgs([
        'sortie://external-import?action=add-images-to-gallery&path=%2Ftmp%2Fa.jpg',
      ]),
    ).toEqual({
      action: 'add-images-to-gallery',
      paths: ['/tmp/a.jpg'],
    });
  });

  it('parses protocol invocations with spaces and multiple paths', () => {
    expect(
      parseExternalImportArgs([
        [
          'sortie://external-import?action=add-to-board',
          'path=/Users/nathanguilhot/Desktop/Screenshot%202026-05-08%20at%2015.59.15.png',
          'path=/Users/nathanguilhot/Desktop/Second%20Image.jpg',
        ].join('&'),
      ]),
    ).toEqual({
      action: 'add-to-board',
      paths: [
        '/Users/nathanguilhot/Desktop/Screenshot 2026-05-08 at 15.59.15.png',
        '/Users/nathanguilhot/Desktop/Second Image.jpg',
      ],
    });
  });

  it('normalizes file URLs with platform path semantics', () => {
    const filePath = path.join(os.tmpdir(), 'Sortie Import Test.jpg');
    expect(normalizeExternalImportPath(new URL(`file://${filePath}`).toString())).toBe(filePath);
  });
});

describe('external import file collection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-external-import-'));
    fs.mkdirSync(path.join(tmpDir, 'nested'));
    fs.writeFileSync(path.join(tmpDir, 'one.jpg'), 'jpg');
    fs.writeFileSync(path.join(tmpDir, 'two.txt'), 'txt');
    fs.writeFileSync(path.join(tmpDir, 'nested', 'three.png'), 'png');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects selected image files without expanding folders', async () => {
    const files = await collectImagePaths(
      [path.join(tmpDir, 'one.jpg'), path.join(tmpDir, 'nested')],
      false,
    );

    expect(files).toEqual([path.join(tmpDir, 'one.jpg')]);
  });

  it('collects nested image files when folders are allowed', async () => {
    const files = await collectImagePaths([tmpDir], true);

    expect(files.sort()).toEqual(
      [path.join(tmpDir, 'nested', 'three.png'), path.join(tmpDir, 'one.jpg')].sort(),
    );
  });
});

describe('ExternalImportService board imports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sortie-external-import-service-'));
    fs.writeFileSync(path.join(tmpDir, 'valid.jpg'), 'jpg');
    fs.writeFileSync(path.join(tmpDir, 'broken.jpg'), 'jpg');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves failed image count when completing a board import', async () => {
    const events: Array<{ channel: string; payload: unknown }> = [];
    const service = new ExternalImportService({
      dbService: {
        images: {
          addImage: async (filePath: string) => {
            if (filePath.endsWith('broken.jpg')) throw new Error('decode failed');
            return { imageId: 123, skipped: false };
          },
          invalidateImageCache: () => undefined,
        },
        boards: {
          addImagesToBoard: async () => undefined,
        },
      },
      watcherService: {},
      availabilityMonitor: {},
      getWindow: () =>
        ({
          isDestroyed: () => false,
          webContents: {
            send: (channel: string, payload: unknown) => events.push({ channel, payload }),
          },
        }) as never,
    } as never);

    await service.run({
      action: 'add-to-board',
      paths: [path.join(tmpDir, 'valid.jpg'), path.join(tmpDir, 'broken.jpg')],
    });
    expect(events[0]).toMatchObject({
      channel: IPC_EVENTS.externalImportProgress,
      payload: {
        action: 'add-to-board',
        current: 0,
        total: 2,
        processed: 0,
        skipped: 0,
        failed: 0,
      },
    });

    const requestEvent = events.find(
      (event) => event.channel === IPC_EVENTS.externalImportBoardRequest,
    );
    const request = requestEvent?.payload as { jobId: string; failed: number } | undefined;

    expect(request?.failed).toBe(1);
    await service.addPendingImagesToBoard(request!.jobId, 7);

    expect(events.at(-1)).toMatchObject({
      channel: IPC_EVENTS.externalImportComplete,
      payload: { action: 'add-to-board', imported: 1, failed: 1 },
    });
  });
});
