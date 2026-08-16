import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Image } from 'shared';
import { useImageStore } from '../imageStore';
import { installSortieAPIStub } from '../../test/sortieApiStub';
import { useBoardStore } from '../boardStore';
import { useFolderStore } from '../folderStore';
import { usePeopleStore } from '../peopleStore';
import { useTagStore } from '../tagStore';

const image: Image = {
  id: 1,
  file_path: '/photos/a.jpg',
  file_name: 'a.jpg',
  file_size: 100,
  file_mtime_ms: 1,
  mime_type: 'image/jpeg',
  width: 400,
  height: 300,
  created_at: '',
  modified_at: '',
  captured_at: null,
  latitude: null,
  longitude: null,
  city: null,
  country: null,
  description: null,
  favorite: false,
  hidden: false,
  missing: false,
};

describe('imageStore edited image replacement', () => {
  beforeEach(() => {
    useImageStore.setState({
      images: [image],
      selectedImage: image,
      viewerBackStack: [],
      viewerForwardStack: [],
      thumbnailRevision: 0,
    });
  });

  it('updates the image record and invalidates path-only thumbnails', () => {
    useImageStore.getState().replaceImage({ ...image, file_mtime_ms: 2, width: 300 });

    expect(useImageStore.getState().selectedImage).toMatchObject({ file_mtime_ms: 2, width: 300 });
    expect(useImageStore.getState().images[0]).toMatchObject({ file_mtime_ms: 2, width: 300 });
    expect(useImageStore.getState().thumbnailRevision).toBe(1);
  });
});

describe('imageStore gallery totals', () => {
  beforeEach(() => {
    useImageStore.setState({
      images: [],
      totalImages: 0,
      lastQuery: null,
      activeBoardId: null,
      loading: false,
      error: null,
    });
    useBoardStore.setState({ loaded: false });
    useFolderStore.setState({ statsLoaded: false });
    usePeopleStore.setState({ loaded: false });
    useTagStore.setState({ loaded: false });
  });

  it('stores the authoritative total returned with a query page', async () => {
    installSortieAPIStub({
      query: vi.fn().mockResolvedValue({ images: [image], total: 234 }),
    });

    await useImageStore.getState().runQuery({});

    expect(useImageStore.getState()).toMatchObject({
      images: [image],
      totalImages: 234,
      hasMore: true,
    });
  });

  it('keeps board detail and board summaries synchronized after membership changes', async () => {
    const getImages = vi.fn().mockResolvedValue({ images: [image], total: 12 });
    const board = {
      id: 5,
      name: 'Board',
      color: '#000000',
      image_count: 12,
      cover_image_id: image.id,
      cover_image_path: image.file_path,
      preview_image_paths: [image.file_path],
    };
    installSortieAPIStub({
      boards: {
        getImages,
        addImage: vi.fn().mockResolvedValue({ success: true }),
        list: vi.fn().mockResolvedValue([board]),
      } as unknown as typeof window.sortieAPI.boards,
      getImage: vi.fn().mockResolvedValue(image),
    });
    useBoardStore.setState({ boards: [{ ...board, image_count: 11 }], loaded: true });
    await useImageStore.getState().fetchBoardImages(board.id);

    await useImageStore.getState().addToBoard(image.id, board.id);

    expect(getImages).toHaveBeenLastCalledWith(board.id, undefined, 0);
    expect(useImageStore.getState().totalImages).toBe(12);
    expect(useBoardStore.getState().boards[0].image_count).toBe(12);
  });
});
