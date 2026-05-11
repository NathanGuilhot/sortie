import { afterEach, describe, expect, it } from 'vitest';
import type { Folder } from 'shared';
import { useFolderStore } from '../folderStore';

function folder(path: string, overrides: Partial<Folder> = {}): Folder {
  return {
    id: 1,
    path,
    watched: true,
    ignored: false,
    exclude_from_face_scan: false,
    available: true,
    writable: true,
    last_scanned: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('folderStore', () => {
  afterEach(() => {
    useFolderStore.setState({ folders: [], folderStats: [], loaded: false, statsLoaded: false });
  });

  it('matches Windows-style child paths when checking writability', () => {
    useFolderStore.setState({
      folders: [folder('C:\\Photos', { writable: false })],
    });

    expect(useFolderStore.getState().isWritable('C:\\Photos\\a.jpg')).toBe(false);
  });

  it('uses the most specific matching folder', () => {
    useFolderStore.setState({
      folders: [
        folder('C:\\Photos', { writable: false }),
        folder('C:\\Photos\\Editable', { id: 2, writable: true }),
      ],
    });

    expect(useFolderStore.getState().isWritable('C:\\Photos\\Editable\\a.jpg')).toBe(true);
  });
});
