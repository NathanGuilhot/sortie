import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { invalidateThumbnailCache } from '../protocols';
import { buildCacheKey } from '../cacheKey';
import { getSortieUserDataPaths } from '../userDataPaths';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true })),
  );
});

describe('thumbnail cache invalidation', () => {
  it('removes every cached size for only the edited image', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sortie-thumbnail-cache-'));
    temporaryDirectories.push(userDataPath);
    const thumbnailDirectory = getSortieUserDataPaths(userDataPath).thumbs;
    const faceThumbnailDirectory = getSortieUserDataPaths(userDataPath).faceThumbs;
    await fs.mkdir(thumbnailDirectory, { recursive: true });
    await fs.mkdir(faceThumbnailDirectory, { recursive: true });
    const editedPath = '/photos/edited.jpg';
    const editedHash = buildCacheKey(editedPath);
    const otherHash = buildCacheKey('/photos/other.jpg');
    await Promise.all([
      fs.writeFile(path.join(thumbnailDirectory, `${editedHash}_200.webp`), ''),
      fs.writeFile(path.join(thumbnailDirectory, `${editedHash}_800.webp`), ''),
      fs.writeFile(path.join(thumbnailDirectory, `${otherHash}_200.webp`), ''),
      fs.writeFile(path.join(faceThumbnailDirectory, `${editedHash}_face_100.jpg`), ''),
      fs.writeFile(path.join(faceThumbnailDirectory, `${otherHash}_face_100.jpg`), ''),
    ]);

    await invalidateThumbnailCache(userDataPath, editedPath);

    expect(await fs.readdir(thumbnailDirectory)).toEqual([`${otherHash}_200.webp`]);
    expect(await fs.readdir(faceThumbnailDirectory)).toEqual([`${otherHash}_face_100.jpg`]);
  });
});
