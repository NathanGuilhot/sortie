import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import { lstatSync, statSync } from 'fs';
import path from 'path';
import {
  ANALYSIS_VERSION,
  AnalysisWorker,
  sourceStamp,
  type FileAnalysis,
  type DatabaseManager,
  type CleanupMove,
} from 'pipeline';
import {
  mostSpecificFolderForPath,
  type DuplicateGroup,
  type DuplicateScanResult,
  type DuplicateCleanupResult,
} from 'shared';
import { PathTaskQueue } from '../pathTaskQueue';

interface DuplicateDeps {
  requireDb(): DatabaseManager;
  invalidateImageCache(): void;
  trashItem(filePath: string): Promise<void>;
}

export class DatabaseDuplicateService {
  private readonly queue = new PathTaskQueue<FileAnalysis>();
  private groups = new Map<string, DuplicateGroup>();
  private busy = false;

  constructor(
    private readonly deps: DuplicateDeps,
    private readonly worker: Pick<
      AnalysisWorker,
      'analyze' | 'match' | 'close'
    > = new AnalysisWorker(),
  ) {}

  refresh(filePath: string, force = false, signal?: AbortSignal): Promise<FileAnalysis> {
    const normalized = path.resolve(filePath);
    return this.queue.run(normalized, async () => {
      const db = this.deps.requireDb();
      const id = db.images.getImageIdByPath(normalized);
      try {
        const stamp = sourceStamp(await fs.stat(normalized));
        const stored = id === null ? null : db.duplicates.get(id);
        if (!force && stored?.version === ANALYSIS_VERSION && stored.source_stamp === stamp)
          return stored;
        if (id !== null) db.duplicates.invalidate(id);
        const analysis = await this.worker.analyze(normalized, signal);
        await this.publish(normalized, analysis);
        return analysis;
      } catch (error) {
        if (id !== null) db.duplicates.invalidate(id);
        throw error;
      }
    });
  }

  async publish(
    filePath: string,
    analysis: FileAnalysis,
    commit?: () => number,
  ): Promise<number | null> {
    const db = this.deps.requireDb();
    if (sourceStamp(await fs.stat(filePath)) !== analysis.source_stamp) {
      const id = db.images.getImageIdByPath(filePath);
      if (id !== null) db.duplicates.invalidate(id);
      throw new Error('The image changed during analysis. Scan again.');
    }
    const id = db.runInTransaction(() => {
      const id = commit?.() ?? db.images.getImageIdByPath(filePath);
      if (id !== null) db.duplicates.save(id, analysis);
      return id;
    });
    if (id !== null) this.deps.invalidateImageCache();
    return id;
  }

  async scan(
    onProgress?: (progress: { current: number; total: number; currentFile: string }) => void,
    signal?: AbortSignal,
  ): Promise<DuplicateScanResult> {
    if (this.busy) throw new Error('Another cleanup operation is running.');
    this.busy = true;
    this.groups.clear();
    const result: DuplicateScanResult = { groups: [], failed: 0, exactOnly: 0, cancelled: false };
    try {
      const db = this.deps.requireDb();
      const images = db.images.getVisibleImagesForDuplicates();
      for (let i = 0; i < images.length; i++) {
        if (signal?.aborted) {
          result.cancelled = true;
          return result;
        }
        try {
          const analysis = await this.refresh(images[i].file_path, false, signal);
          if (analysis.visual_error) result.exactOnly++;
        } catch (error) {
          if (signal?.aborted) {
            result.cancelled = true;
            return result;
          }
          result.failed++;
          console.warn('[duplicates] analysis failed:', images[i].file_path, error);
        }
        onProgress?.({ current: i + 1, total: images.length, currentFile: '' });
      }
      const visible = db.images.getVisibleImagesForDuplicates();
      const byId = new Map(visible.map((image) => [image.id, image]));
      const analyses = visible.flatMap((image) => {
        const analysis = db.duplicates.get(image.id);
        return analysis?.version === ANALYSIS_VERSION
          ? [{ ...analysis, file_path: image.file_path }]
          : [];
      });
      const matches = await this.worker.match(analyses, db.duplicates.dismissedPairs(), signal);
      if (signal?.aborted) {
        result.cancelled = true;
        return result;
      }
      const revisions = new Map(analyses.map((a) => [a.id, a.source_hash]));
      const stillVisible = new Set(db.images.getVisibleImageIds());
      for (const match of matches) {
        if (
          !match.ids.every(
            (id) =>
              stillVisible.has(id) && db.duplicates.get(id)?.source_hash === revisions.get(id),
          )
        )
          continue;
        const group: DuplicateGroup = {
          groupId: createHash('sha256')
            .update(match.ids.map((id) => `${id}:${revisions.get(id)}`).join('|'))
            .digest('hex'),
          images: match.ids.map((id) => byId.get(id)!),
          matchType: match.matchType,
        };
        result.groups.push(group);
        this.groups.set(group.groupId, group);
      }
      return result;
    } catch (error) {
      if (signal?.aborted) {
        result.cancelled = true;
        return result;
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private getGroup(groupId: string): DuplicateGroup {
    const group = this.groups.get(groupId);
    if (!group) throw new Error('This match is out of date. Scan again.');
    return group;
  }

  async dismiss(groupId: string): Promise<void> {
    if (this.busy) throw new Error('Another cleanup operation is running.');
    const group = this.getGroup(groupId);
    this.busy = true;
    try {
      for (const image of group.images) {
        const current = await this.refresh(image.file_path, true);
        if (current.source_hash !== image.file_hash)
          throw new Error('An image changed. Scan again.');
      }
      this.deps.requireDb().duplicates.dismiss(group.images.map((image) => image.id));
      this.groups.delete(groupId);
    } finally {
      this.busy = false;
    }
  }

  async keep(groupId: string, keepId: number): Promise<DuplicateCleanupResult> {
    if (this.busy) throw new Error('Another cleanup operation is running.');
    const group = this.getGroup(groupId);
    const keeper = group.images.find((image) => image.id === keepId);
    if (!keeper) throw new Error('Select an image in this group.');
    this.busy = true;
    const result: DuplicateCleanupResult = { removedIds: [], failed: [] };
    try {
      const db = this.deps.requireDb();
      const folders = db.folders.listFolders();
      const visible = new Set(db.images.getVisibleImageIds());
      if (!visible.has(keepId))
        throw new Error('The selected image is no longer available. Scan again.');
      const candidates = group.images.filter((image) => {
        const folder = mostSpecificFolderForPath(folders, image.file_path);
        return (
          image.id !== keepId &&
          visible.has(image.id) &&
          (!folder || (folder.writable && folder.available))
        );
      });
      if (!candidates.length) throw new Error('The other images are read-only or unavailable.');
      for (const image of [keeper, ...candidates]) {
        const current = await this.refresh(image.file_path, true);
        if (current.source_hash !== image.file_hash)
          throw new Error('An image changed. Scan again before cleanup.');
      }
      const keeperPath = await fs.realpath(keeper.file_path);
      for (const image of candidates) {
        try {
          const folder = mostSpecificFolderForPath(folders, image.file_path);
          if (folder && (!folder.writable || !folder.available))
            throw new Error('This image is read-only or unavailable.');
          if (
            (await fs.lstat(image.file_path)).isSymbolicLink() ||
            (await fs.realpath(image.file_path)) === keeperPath
          ) {
            throw new Error('Linked images cannot be removed by cleanup.');
          }
          await fs.access(path.dirname(image.file_path), fs.constants.W_OK);
          const kept = await this.refresh(keeper.file_path, true);
          const current = await this.refresh(image.file_path, true);
          if (kept.source_hash !== keeper.file_hash || current.source_hash !== image.file_hash)
            throw new Error('An image changed. Scan again.');
          const move: CleanupMove = {
            id: randomUUID(),
            image_id: image.id,
            keeper_id: keepId,
            keeper_hash: kept.source_hash,
            file_path: image.file_path,
            source_hash: current.source_hash,
            state: 'pending',
            error: null,
          };
          db.duplicates.prepareMove(move);
          // No awaited work between these checks and starting the Trash move.
          if (
            sourceStamp(statSync(keeper.file_path)) !== kept.source_stamp ||
            sourceStamp(statSync(image.file_path)) !== current.source_stamp ||
            lstatSync(image.file_path).isSymbolicLink()
          ) {
            db.duplicates.setMoveState(move.id, 'failed', 'An image changed before removal.');
            throw new Error('An image changed. Scan again.');
          }
          db.duplicates.setMoveState(move.id, 'moving');
          try {
            await this.deps.trashItem(image.file_path);
          } catch (error) {
            db.duplicates.setMoveState(move.id, 'failed', String(error));
            throw error;
          }
          db.duplicates.setMoveState(move.id, 'trashed');
          try {
            db.duplicates.finishMove(move);
          } catch (error) {
            throw new Error(
              'The image was moved to Trash. Restart Sortie to finish updating its boards.',
              { cause: error },
            );
          }
          result.removedIds.push(image.id);
        } catch (error) {
          result.failed.push({
            imageId: image.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (result.removedIds.length) {
        this.groups.clear();
        this.deps.invalidateImageCache();
      }
      return result;
    } finally {
      this.busy = false;
    }
  }

  async recover(): Promise<void> {
    const db = this.deps.requireDb();
    for (const move of db.duplicates.pendingMoves()) {
      if (move.state !== 'trashed') {
        db.duplicates.setMoveState(
          move.id,
          move.state === 'moving' ? 'uncertain' : 'failed',
          'Cleanup was interrupted. The original record and board memberships have been retained.',
        );
        continue;
      }
      try {
        await fs.stat(move.file_path);
        db.duplicates.setMoveState(
          move.id,
          'failed',
          'The image was restored before cleanup finished.',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          db.duplicates.setMoveState(move.id, 'uncertain', String(error));
          continue;
        }
        try {
          const keeper = db.images.getImageById(move.keeper_id);
          if (
            !keeper ||
            (await this.refresh(keeper.file_path, true)).source_hash !== move.keeper_hash
          ) {
            throw new Error('The kept image changed before recovery.', { cause: error });
          }
          db.duplicates.finishMove(move);
        } catch (error) {
          db.duplicates.setMoveState(move.id, 'uncertain', String(error));
          console.warn('[cleanup] recovery needs attention:', move.id, error);
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
