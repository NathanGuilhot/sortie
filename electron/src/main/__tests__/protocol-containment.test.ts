import { describe, expect, it } from 'vitest';
import { createProtocolPathGuard, isServablePath } from '../protocol-guard';

describe('isServablePath', () => {
  const folders = ['/lib/photos'];
  const roots = ['/userdata'];

  it('allows files inside a registered library folder', () => {
    expect(isServablePath('/lib/photos/sub/a.jpg', folders, roots)).toBe(true);
  });

  it('allows files inside an allowed root', () => {
    expect(isServablePath('/userdata/thumbs/x.webp', folders, roots)).toBe(true);
  });

  it('rejects files outside all folders and roots', () => {
    expect(isServablePath('/etc/passwd', folders, roots)).toBe(false);
  });

  it('rejects traversal escaping a folder', () => {
    expect(isServablePath('/lib/photos/../../etc/passwd', folders, roots)).toBe(false);
  });

  it('rejects the folder path itself', () => {
    expect(isServablePath('/lib/photos', folders, roots)).toBe(false);
  });

  it('rejects sibling directories sharing the folder path as a string prefix', () => {
    expect(isServablePath('/lib/photos-evil/a.jpg', folders, roots)).toBe(false);
  });

  it('handles unnormalized folder spellings', () => {
    expect(isServablePath('/lib/photos/a.jpg', ['/lib/photos/'], [])).toBe(true);
  });
});

describe('createProtocolPathGuard', () => {
  const deps = {
    allowedRoots: ['/userdata'],
    getLibraryFolderPaths: async () => ['/lib/photos'],
    isKnownImagePath: (p: string) => p === '/external/board/known.jpg',
  };

  it('allows library and cache paths', async () => {
    const guard = createProtocolPathGuard(deps);
    await expect(guard('/lib/photos/a.jpg')).resolves.toBe(true);
    await expect(guard('/userdata/thumbs/t.webp')).resolves.toBe(true);
  });

  it('allows known external images outside any folder', async () => {
    const guard = createProtocolPathGuard(deps);
    await expect(guard('/external/board/known.jpg')).resolves.toBe(true);
  });

  it('rejects unknown paths outside folders and roots', async () => {
    const guard = createProtocolPathGuard(deps);
    await expect(guard('/external/board/other.jpg')).resolves.toBe(false);
    await expect(guard('/etc/passwd')).resolves.toBe(false);
  });

  it('falls back to allowed roots only while the library is unavailable', async () => {
    const guard = createProtocolPathGuard({
      allowedRoots: ['/userdata'],
      getLibraryFolderPaths: async () => {
        throw new Error('db not ready');
      },
      isKnownImagePath: () => {
        throw new Error('db not ready');
      },
    });
    await expect(guard('/userdata/thumbs/t.webp')).resolves.toBe(true);
    await expect(guard('/lib/photos/a.jpg')).resolves.toBe(false);
  });
});
