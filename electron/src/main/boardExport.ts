import { ZipArchive } from 'archiver';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import type { BoardExportFailure, BoardExportResult, Image } from 'shared';

export interface BoardExportOptions {
  images: Image[];
  destinationPath: string;
  signal: AbortSignal;
  onProgress?: (progress: { current: number; total: number; currentFile: string }) => void;
}

function isMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function failureReason(error: unknown): string {
  if (isMissingError(error)) return 'File not found';
  if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
    return 'Permission denied';
  }
  return error instanceof Error ? error.message : 'File is unavailable';
}

export function createArchiveEntryName(index: number, total: number, fileName: string): string {
  const width = Math.max(3, String(total).length);
  const safeName = path.basename(fileName).replace(/[\\/\0]/g, '-');
  return `${String(index + 1).padStart(width, '0')}-${safeName || 'image'}`;
}

export function createDefaultArchiveName(boardName: string): string {
  const safeName = boardName
    .replace(/[<>:"/\\|?*]|\p{Cc}/gu, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return `${safeName || 'Board'}.zip`;
}

export function ensureZipExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.zip') ? filePath : `${filePath}.zip`;
}

async function preflightImages(
  images: Image[],
  signal: AbortSignal,
): Promise<BoardExportFailure[]> {
  const failures: BoardExportFailure[] = [];
  for (const image of images) {
    signal.throwIfAborted();
    try {
      const stat = await fs.promises.stat(image.file_path);
      if (!stat.isFile()) throw new Error('Path is not a file');
      await fs.promises.access(image.file_path, fs.constants.R_OK);
    } catch (error) {
      failures.push({ fileName: image.file_name, reason: failureReason(error) });
    }
  }
  return failures;
}

export async function exportBoardZip(options: BoardExportOptions): Promise<BoardExportResult> {
  const { images, destinationPath, signal, onProgress } = options;
  try {
    signal.throwIfAborted();
    const failures = await preflightImages(images, signal);
    if (failures.length > 0) return { status: 'failed', failures };

    const tempPath = path.join(
      path.dirname(destinationPath),
      `.${path.basename(destinationPath)}.sortie-${randomUUID()}.tmp`,
    );
    const output = fs.createWriteStream(tempPath, { flags: 'wx' });
    const archive = new ZipArchive({ store: true });
    let completed = 0;
    const originalNames = new Map<string, string>();

    archive.on('entry', (entry) => {
      completed += 1;
      onProgress?.({
        current: completed,
        total: images.length,
        currentFile: originalNames.get(entry.name) ?? entry.name,
      });
    });
    archive.on('warning', (error) => output.destroy(error));
    archive.on('error', (error) => output.destroy(error));
    archive.pipe(output);

    const outputFinished = finished(output);
    const cancel = () => {
      archive.abort();
      output.destroy();
    };
    signal.addEventListener('abort', cancel, { once: true });

    try {
      images.forEach((image, index) => {
        const entryName = createArchiveEntryName(index, images.length, image.file_name);
        originalNames.set(entryName, image.file_name);
        archive.file(image.file_path, { name: entryName });
      });
      await Promise.all([archive.finalize(), outputFinished]);
      signal.throwIfAborted();
      await fs.promises.rename(tempPath, destinationPath);
      return { status: 'saved', filePath: destinationPath };
    } catch (error) {
      await outputFinished.catch(() => {});
      await fs.promises.rm(tempPath, { force: true }).catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return { status: 'cancelled' };
    }
    return {
      status: 'failed',
      failures: [{ fileName: 'Export', reason: failureReason(error) }],
    };
  }
}
