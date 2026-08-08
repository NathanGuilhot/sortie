import { describe, expect, it } from 'vitest';
import { folderCoversPath, mostSpecificFolderForPath, toPortablePath } from '../library-paths';

describe('toPortablePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPortablePath('C:\\Photos\\Trips\\a.jpg')).toBe('C:/Photos/Trips/a.jpg');
  });

  it('leaves posix paths unchanged', () => {
    expect(toPortablePath('/photos/a.jpg')).toBe('/photos/a.jpg');
  });
});

describe('folderCoversPath', () => {
  it('covers files inside the folder', () => {
    expect(folderCoversPath('/photos', '/photos/trips/a.jpg')).toBe(true);
  });

  it('covers the exact folder path itself', () => {
    expect(folderCoversPath('/photos', '/photos')).toBe(true);
  });

  it('does not cover files outside the folder', () => {
    expect(folderCoversPath('/photos', '/other/a.jpg')).toBe(false);
  });

  it('does not treat a string-prefix sibling as covered', () => {
    expect(folderCoversPath('/photos', '/photos-backup/a.jpg')).toBe(false);
  });

  it('covers across mixed separators', () => {
    expect(folderCoversPath('C:\\Photos', 'C:/Photos/a.jpg')).toBe(true);
    expect(folderCoversPath('C:/Photos', 'C:\\Photos\\Trips\\a.jpg')).toBe(true);
  });
});

describe('mostSpecificFolderForPath', () => {
  const folders = [{ path: '/photos' }, { path: '/photos/trips' }, { path: '/other' }];

  it('returns the deepest covering folder', () => {
    expect(mostSpecificFolderForPath(folders, '/photos/trips/a.jpg')?.path).toBe('/photos/trips');
  });

  it('returns the parent when only it covers', () => {
    expect(mostSpecificFolderForPath(folders, '/photos/b.jpg')?.path).toBe('/photos');
  });

  it('returns null when nothing covers', () => {
    expect(mostSpecificFolderForPath(folders, '/elsewhere/c.jpg')).toBeNull();
  });

  it('handles Windows-style folder registrations', () => {
    const winFolders = [{ path: 'C:\\Photos' }, { path: 'C:\\Photos\\Trips' }];
    expect(mostSpecificFolderForPath(winFolders, 'C:\\Photos\\Trips\\a.jpg')?.path).toBe(
      'C:\\Photos\\Trips',
    );
  });
});
