import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Image } from 'shared';
import { MetadataEditorSupplementarySections } from '../MetadataEditorSupplementarySections';

const image: Image = {
  id: 1,
  file_path: '/photos/example.jpg',
  file_name: 'example.jpg',
  file_size: 1024,
  file_mtime_ms: null,
  mime_type: 'image/jpeg',
  width: 100,
  height: 100,
  created_at: '2026-01-01T00:00:00.000Z',
  modified_at: '2026-01-01T00:00:00.000Z',
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

function renderSections(
  overrides: Partial<ComponentProps<typeof MetadataEditorSupplementarySections>> = {},
) {
  const onRecomputeEmbedding = vi.fn();
  return {
    onRecomputeEmbedding,
    ...render(
      <MetadataEditorSupplementarySections
        cameraName=""
        cameraSettings=""
        embeddingStatus="idle"
        hasCamera={false}
        image={image}
        isDirty={false}
        isSaving={false}
        saveSuccess={false}
        onRecomputeEmbedding={onRecomputeEmbedding}
        onSave={vi.fn()}
        {...overrides}
      />,
    ),
  };
}

describe('MetadataEditorSupplementarySections', () => {
  afterEach(cleanup);

  it('explains missing visual-search indexing and retries from the warning', () => {
    const { getByRole, getByText, onRecomputeEmbedding } = renderSections({
      image: { ...image, embedded: false },
    });

    expect(getByText('Not included in visual search')).toBeTruthy();
    expect(
      getByText(/will not appear in visual search results until indexing succeeds/i),
    ).toBeTruthy();

    fireEvent.click(getByRole('button', { name: 'Retry indexing' }));
    expect(onRecomputeEmbedding).toHaveBeenCalledOnce();
  });

  it('does not show indexing controls for an indexed image', () => {
    const { queryByRole, queryByText } = renderSections({ image: { ...image, embedded: true } });

    expect(queryByText('Not included in visual search')).toBeNull();
    expect(queryByRole('button', { name: /indexing/i })).toBeNull();
  });

  it('keeps the recovery guidance visible after a failed retry', () => {
    const { getByRole, getByText } = renderSections({
      image: { ...image, embedded: false },
      embeddingStatus: 'error',
    });

    expect(getByText('Retry failed. Please try indexing again.')).toBeTruthy();
    expect(getByRole('button', { name: 'Retry indexing' })).toBeTruthy();
  });
});
