import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Image, Person } from 'shared';
import { installSortieAPIStub } from '../../test/sortieApiStub';
import { usePeopleStore } from '../peopleStore';

const person: Person = {
  id: 1,
  name: 'Ada',
  thumbnail_face_id: null,
  face_count: 3,
  image_count: 3,
  created_at: '',
  updated_at: '',
};

const image = (id: number): Image => ({
  id,
  file_path: `/photos/${id}.jpg`,
  file_name: `${id}.jpg`,
  file_size: 1,
  mime_type: 'image/jpeg',
  width: 1,
  height: 1,
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
});

describe('peopleStore paging', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    usePeopleStore.setState({
      persons: [],
      selectedPerson: null,
      personImages: [],
      personImageTotal: 0,
      hasMorePersonImages: false,
      loading: false,
      loaded: false,
    });
  });

  it('keeps the authoritative photo total while appending pages', async () => {
    const getPersonImages = vi
      .fn()
      .mockResolvedValueOnce({ images: [image(1), image(2)], total: 3 })
      .mockResolvedValueOnce({ images: [image(3)], total: 3 });
    installSortieAPIStub({ getPersonImages });
    usePeopleStore.setState({ selectedPerson: person });

    await usePeopleStore.getState().fetchPersonImages(person.id, 2, 0);
    expect(usePeopleStore.getState()).toMatchObject({
      personImageTotal: 3,
      hasMorePersonImages: true,
    });

    await usePeopleStore.getState().loadMorePersonImages();
    expect(usePeopleStore.getState()).toMatchObject({
      personImages: [image(1), image(2), image(3)],
      personImageTotal: 3,
      hasMorePersonImages: false,
    });
  });
});
