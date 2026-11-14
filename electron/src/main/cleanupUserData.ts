import fs from 'fs/promises';
import path from 'path';

export async function cleanupUserData(userDataRoot: string): Promise<void> {
  const remove = async (target: string): Promise<void> => {
    try {
      await fs.rm(target, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[maintenance] could not remove ${target}:`, error);
    }
  };

  await remove(path.join(userDataRoot, 'face-thumbs'));

  const thumbs = path.join(userDataRoot, 'thumbs');
  try {
    const stats = await fs.lstat(thumbs);
    if (!stats.isDirectory()) {
      console.warn(`[maintenance] skipping non-directory ${thumbs}`);
      return;
    }
    const entries = await fs.readdir(thumbs, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^[a-f0-9]{16}_face\.jpg$/.test(entry.name))
        .map((entry) => remove(path.join(thumbs, entry.name))),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[maintenance] could not clean ${thumbs}:`, error);
    }
  }
}
