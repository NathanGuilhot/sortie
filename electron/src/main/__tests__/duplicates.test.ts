import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { createTestDb, seedImage, seedFolder, type TestDb } from 'pipeline';
import { analyzeFile, matchDuplicates } from '../../../../pipeline/src/lib/duplicate-analysis';
import { DatabaseDuplicateService } from '../database/duplicates';
import { DatabaseImagesService } from '../database/images';
import { NO_EVIDENCE } from 'pipeline';

const art = Buffer.from(
  '<svg width="240" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="240" height="180" fill="#eeddbb"/><circle cx="70" cy="70" r="50" fill="#ba5b75"/><rect x="110" y="90" width="100" height="70" fill="#428872"/></svg>',
);

describe('duplicate scans and cleanup', () => {
  let t: TestDb, folder: string, service: DatabaseDuplicateService;
  let trash: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    t = createTestDb();
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-cleanup-'));
    trash = vi.fn(async (file: string) => {
      await fs.rename(file, `${file}.trashed`);
    });
    service = new DatabaseDuplicateService(
      { requireDb: () => t.manager, invalidateImageCache: () => undefined, trashItem: trash },
      {
        analyze: analyzeFile,
        match: async (images, dismissed) => matchDuplicates(images, dismissed),
        close: async () => undefined,
      },
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await service.close();
    t.close();
    await fs.rm(folder, { recursive: true, force: true });
  });

  async function seedCopies() {
    const a = path.join(folder, 'one.png'),
      b = path.join(folder, 'two.webp');
    await sharp(art).png().toFile(a);
    await sharp(art).webp({ lossless: true }).toFile(b);
    return { a, b, left: seedImage(t, a), right: seedImage(t, b) };
  }

  it('repairs stale hashes and dimensions without changing user metadata', async () => {
    const { a, left } = await seedCopies();
    t.raw
      .prepare('UPDATE images SET width=999, file_hash=?, description=?, captured_at=? WHERE id=?')
      .run('old', 'mine', '2020-01-01', left);
    const result = await service.scan();
    expect(result.groups).toHaveLength(1);
    const row = t.manager.images.getImageById(left)!;
    expect(row.width).toBe(240);
    expect(row.file_hash).toBe(await import('pipeline').then((p) => p.computeFileHash(a)));
    expect(row.description).toBe('mine');
    expect(row.captured_at).toBe('2020-01-01');
    expect(result.failed).toBe(0);
  });

  it('invalidates dismissals after a content change and never acts on stale results', async () => {
    const { a, b, left } = await seedCopies();
    const initial = (await service.scan()).groups[0];
    await service.dismiss(initial.groupId);
    expect((await service.scan()).groups).toHaveLength(0);
    await sharp(art).resize(120, 90).png().toFile(a);
    expect((await service.scan()).groups).toHaveLength(1);
    const fresh = (await service.scan()).groups[0];
    await fs.writeFile(b, 'replaced externally');
    await expect(service.keep(fresh.groupId, left)).rejects.toThrow('changed');
    expect(trash).not.toHaveBeenCalled();
  });

  it('combines board memberships automatically, keeps selected metadata, and retains recovery records', async () => {
    const { left, right, b } = await seedCopies();
    const one = t.manager.boards.createBoard('One').id,
      two = t.manager.boards.createBoard('Two').id;
    t.manager.boards.addImagesToBoard([left, right], one);
    t.manager.boards.addImagesToBoard([right], two);
    t.manager.images.updateImageMetadata(left, { description: 'selected description' });
    t.manager.images.updateImageMetadata(right, { description: 'other description' });
    const group = (await service.scan()).groups[0];
    const result = await service.keep(group.groupId, left);
    expect(result).toEqual({ removedIds: [right], failed: [] });
    expect(t.manager.boards.getBoardImageIdsPaged(one, 100, 0)).toEqual([left]);
    expect(t.manager.boards.getBoardImageIdsPaged(two, 100, 0)).toEqual([left]);
    expect(t.manager.images.getImageById(left)!.description).toBe('selected description');
    expect(t.manager.images.getImageById(right)!.description).toBe('other description');
    expect(t.manager.images.getImageById(right)!.missing).toBe(1);
    await expect(fs.stat(b)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(t.raw.prepare('SELECT state FROM cleanup_moves').get()).toEqual({ state: 'complete' });
    expect((await service.scan()).groups).toHaveLength(0);
  });

  it('allows a read-only keeper, and respects read-only removal candidates', async () => {
    const { a, b, left, right } = await seedCopies();
    const keeperFolder = path.join(folder, 'readonly');
    await fs.mkdir(keeperFolder);
    const keeper = path.join(keeperFolder, 'one.png');
    await fs.rename(a, keeper);
    t.raw.prepare('UPDATE images SET file_path=? WHERE id=?').run(keeper, left);
    seedFolder(t, keeperFolder, { writable: false });
    const group = (await service.scan()).groups[0];
    await expect(service.keep(group.groupId, right)).rejects.toThrow('read-only');
    expect(trash).not.toHaveBeenCalled();
    expect((await service.keep(group.groupId, left)).removedIds).toEqual([right]);
    await expect(fs.stat(b)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not fall back to permanent deletion when Trash fails', async () => {
    const { left, right, b } = await seedCopies();
    trash.mockRejectedValueOnce(new Error('Trash unavailable'));
    const group = (await service.scan()).groups[0];
    const result = await service.keep(group.groupId, left);
    expect(result.failed[0].message).toBe('Trash unavailable');
    expect(result.removedIds).toEqual([]);
    expect((await fs.stat(b)).isFile()).toBe(true);
    expect(t.manager.images.getImageById(right)!.missing).toBe(0);
    expect(t.raw.prepare('SELECT state FROM cleanup_moves').get()).toEqual({ state: 'failed' });
  });

  it('recovers the DB update after an interruption following a Trash move', async () => {
    const { left, right, b } = await seedCopies();
    await service.scan();
    const hash = t.manager.duplicates.get(right)!.source_hash;
    t.manager.duplicates.prepareMove({
      id: 'crash',
      image_id: right,
      keeper_id: left,
      keeper_hash: t.manager.duplicates.get(left)!.source_hash,
      file_path: b,
      source_hash: hash,
    });
    t.manager.duplicates.setMoveState('crash', 'moving');
    await trash(b);
    t.manager.duplicates.setMoveState('crash', 'trashed');
    await service.recover();
    expect(t.manager.images.getImageById(right)!.missing).toBe(1);
    expect(t.raw.prepare('SELECT state FROM cleanup_moves').get()).toEqual({ state: 'complete' });
    await fs.rename(`${b}.trashed`, b);
    // A restored file retains its original ID and metadata, ready for normal import to clear missing.
    expect(t.manager.images.getImageIdByPath(b)).toBe(right);
    expect((await service.refresh(b)).source_hash).toBe(hash);
  });

  it('rejects a keeper change during candidate analysis immediately before Trash', async () => {
    const { a, b, left } = await seedCopies();
    const group = (await service.scan()).groups[0];
    const refresh = service.refresh.bind(service);
    let candidateReads = 0;
    vi.spyOn(service, 'refresh').mockImplementation(async (file, force, signal) => {
      const result = await refresh(file, force, signal);
      if (file === b && ++candidateReads === 2) {
        await sharp({ create: { width: 240, height: 180, channels: 3, background: '#ff00aa' } })
          .png()
          .toFile(a);
      }
      return result;
    });
    const result = await service.keep(group.groupId, left);
    expect(result.failed[0].message).toContain('changed');
    expect(result.removedIds).toEqual([]);
    expect(trash).not.toHaveBeenCalled();
  });

  it('keeps trashed records out of a reconnected folder and restores their metadata on reimport', async () => {
    const { left, right, b } = await seedCopies();
    seedFolder(t, folder);
    t.manager.images.updateImageMetadata(right, { description: 'restorable description' });
    const group = (await service.scan()).groups[0];
    await service.keep(group.groupId, left);
    t.manager.folders.markMissingUnderFolder(folder);
    t.manager.folders.clearMissingUnderFolder(folder);
    expect(t.manager.images.getVisibleImageIds()).not.toContain(right);
    await fs.rename(`${b}.trashed`, b);
    const importer = new DatabaseImagesService({
      requireDb: () => t.manager,
      analysis: service,
      getEmbedder: () => {
        throw new Error('CLIP unavailable');
      },
      getSuggestionEngine: () => {
        throw new Error('not needed');
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      (await importer.addImage(b, { provenance: { read: async () => NO_EVIDENCE } })).imageId,
    ).toBe(right);
    expect(t.manager.images.getVisibleImageIds()).toContain(right);
    expect(t.manager.images.getImageById(right)!.description).toBe('restorable description');
  });

  it('leaves interrupted unconfirmed moves unresolved rather than treating a missing path as Trash success', async () => {
    const { left, right, b } = await seedCopies();
    await service.scan();
    const board = t.manager.boards.createBoard('Source board').id;
    t.manager.boards.addImagesToBoard([right], board);
    t.manager.duplicates.prepareMove({
      id: 'ambiguous',
      image_id: right,
      keeper_id: left,
      keeper_hash: t.manager.duplicates.get(left)!.source_hash,
      file_path: b,
      source_hash: t.manager.duplicates.get(right)!.source_hash,
    });
    t.manager.duplicates.setMoveState('ambiguous', 'moving');
    await fs.rename(b, `${b}.temporarily-unavailable`);
    await service.recover();
    expect(t.raw.prepare('SELECT state FROM cleanup_moves').get()).toEqual({ state: 'uncertain' });
    expect(t.manager.images.getImageById(right)!.missing).toBe(0);
    expect(t.manager.boards.getBoardImageIdsPaged(board, 100, 0)).toEqual([right]);
  });

  it('does not publish a clean scan after cancellation or unreadable files', async () => {
    await seedCopies();
    seedImage(t, path.join(folder, 'gone.png'));
    const controller = new AbortController();
    controller.abort();
    const cancelled = await service.scan(undefined, controller.signal);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.groups).toEqual([]);
    const result = await service.scan();
    expect(result.failed).toBe(1);
    expect(result.groups).toHaveLength(1);
  });
});
