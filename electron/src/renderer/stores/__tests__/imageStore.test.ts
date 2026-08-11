import { beforeEach, describe, expect, it } from 'vitest';
import type { Image } from 'shared';
import { useImageStore } from '../imageStore';

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
