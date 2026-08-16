import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Image } from 'shared';
import { OriginBackfillBridge } from '../OriginBackfillBridge';
import { useImageStore } from '../../stores/imageStore';
import { useUIStore } from '../../stores/uiStore';

const selected = {
  id: 12,
  file_path: '/photos/a.jpg',
  file_name: 'a.jpg',
  file_size: 1,
  mime_type: 'image/jpeg',
  width: 1,
  height: 1,
  created_at: '2020-01-01T00:00:00.000Z',
  modified_at: '2020-01-01T00:00:00.000Z',
  captured_at: null,
  latitude: null,
  longitude: null,
  city: null,
  country: null,
  description: null,
  favorite: false,
  hidden: false,
  missing: false,
} satisfies Image;

describe('OriginBackfillBridge', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useUIStore.setState({ originDataRevision: 0 });
    useImageStore.setState({ selectedImage: null, images: [] });
  });

  it('increments the origin revision and refreshes the selected image', async () => {
    let complete: ((result: { filled: number }) => void) | undefined;
    const refreshed = { ...selected, origin_kind: 'downloaded' as const };
    const getImage = vi.fn().mockResolvedValue(refreshed);
    const onOriginBackfillComplete = vi.fn(
      (callback: (result: { filled: number }) => void): (() => void) => {
        complete = callback;
        return vi.fn();
      },
    );
    window.sortieAPI = {
      onOriginBackfillComplete,
      getImage,
    } as unknown as typeof window.sortieAPI;
    useImageStore.setState({ selectedImage: selected, images: [selected] });
    render(<OriginBackfillBridge />);

    act(() => complete?.({ filled: 1 }));

    expect(useUIStore.getState().originDataRevision).toBe(1);
    await waitFor(() => expect(getImage).toHaveBeenCalledWith(selected.id));
    await waitFor(() => expect(useImageStore.getState().selectedImage).toEqual(refreshed));
  });
});
