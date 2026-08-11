import { act, cleanup, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Image } from 'shared';
import { ImageCropEditor } from '../ImageCropEditor';

const image: Image = {
  id: 1,
  file_path: '/photos/a.jpg',
  file_name: 'a.jpg',
  file_size: 1,
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

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

function resizeEditor(width: number, height: number) {
  if (!resizeObserverCallback) throw new Error('The editor viewport is not being observed');
  act(() => {
    resizeObserverCallback?.(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

function finishPreviewLoad(view: ReturnType<typeof render>, width = 400, height = 300) {
  const loader = view.getByTestId('pending-image-preview') as HTMLImageElement;
  Object.defineProperties(loader, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  fireEvent.load(loader);
}

describe('ImageCropEditor', () => {
  beforeEach(() => {
    resizeObserverCallback = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps the crop controls on the image surface when the editor is resized', () => {
    const view = render(<ImageCropEditor image={image} onCancel={vi.fn()} onApplied={vi.fn()} />);
    finishPreviewLoad(view);

    resizeEditor(600, 600);

    const preview = view.getByAltText(image.file_name);
    const surface = preview.parentElement;
    expect(surface).not.toBeNull();
    expect({ width: surface?.style.width, height: surface?.style.height }).toEqual({
      width: '600px',
      height: '450px',
    });
    expect(surface?.contains(view.getByRole('button', { name: 'Resize crop nw' }))).toBe(true);

    resizeEditor(300, 600);

    expect({ width: surface?.style.width, height: surface?.style.height }).toEqual({
      width: '300px',
      height: '225px',
    });
  });

  it('closes without warning or writing when Apply is a no-op', async () => {
    const onCancel = vi.fn();
    const applyImageEdit = vi.fn();
    const get = vi.fn();
    Object.defineProperty(window, 'sortieAPI', {
      configurable: true,
      value: { applyImageEdit, settings: { get, set: vi.fn() } },
    });
    const view = render(<ImageCropEditor image={image} onCancel={onCancel} onApplied={vi.fn()} />);
    finishPreviewLoad(view);
    await userEvent.click(view.getByRole('button', { name: 'Apply' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
    expect(applyImageEdit).not.toHaveBeenCalled();
  });

  it('asks before overwriting after a real edit', async () => {
    Object.defineProperty(window, 'sortieAPI', {
      configurable: true,
      value: {
        applyImageEdit: vi.fn(),
        settings: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
      },
    });
    const view = render(<ImageCropEditor image={image} onCancel={vi.fn()} onApplied={vi.fn()} />);
    finishPreviewLoad(view);
    await userEvent.click(view.getByRole('button', { name: 'Rotate 90° clockwise' }));
    finishPreviewLoad(view, 300, 400);
    await userEvent.click(view.getByRole('button', { name: 'Apply' }));
    expect(view.getByText('Overwrite original image?')).toBeTruthy();
  });

  it('renders rotation through an oriented preview bitmap', async () => {
    const view = render(<ImageCropEditor image={image} onCancel={vi.fn()} onApplied={vi.fn()} />);
    finishPreviewLoad(view);

    await userEvent.click(view.getByRole('button', { name: 'Rotate 90° clockwise' }));

    const preview = view.getByTestId('pending-image-preview') as HTMLImageElement;
    const previewUrl = new URL(preview.src);
    expect({
      protocol: previewUrl.protocol,
      turns: previewUrl.searchParams.get('turns'),
      flipped: previewUrl.searchParams.get('flipped'),
      size: previewUrl.searchParams.get('size'),
      transform: preview.style.transform,
    }).toEqual({
      protocol: 'sortie-edit-preview:',
      turns: '1',
      flipped: 'false',
      size: '1600',
      transform: '',
    });
  });

  it('keeps the last preview visible while the next orientation loads', async () => {
    const view = render(<ImageCropEditor image={image} onCancel={vi.fn()} onApplied={vi.fn()} />);
    finishPreviewLoad(view);
    const initialPreview = view.getByAltText(image.file_name) as HTMLImageElement;
    const initialUrl = initialPreview.src;

    await userEvent.click(view.getByRole('button', { name: 'Rotate 90° clockwise' }));

    expect((view.getByAltText(image.file_name) as HTMLImageElement).src).toBe(initialUrl);
    expect(view.getByRole('status', { name: 'Loading image preview' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Resize crop nw' })).toBeNull();
    expect(
      view.getByRole('button', { name: 'Rotate 90° clockwise' }).hasAttribute('disabled'),
    ).toBe(true);

    finishPreviewLoad(view, 300, 400);

    expect(
      new URL((view.getByAltText(image.file_name) as HTMLImageElement).src).searchParams.get(
        'turns',
      ),
    ).toBe('1');
    expect(view.queryByRole('status', { name: 'Loading image preview' })).toBeNull();
  });

  it('keeps the last preview and offers retry when the next preview fails', async () => {
    const view = render(<ImageCropEditor image={image} onCancel={vi.fn()} onApplied={vi.fn()} />);
    finishPreviewLoad(view);
    const initialUrl = (view.getByAltText(image.file_name) as HTMLImageElement).src;
    await userEvent.click(view.getByRole('button', { name: 'Rotate 90° clockwise' }));
    const failedUrl = (view.getByTestId('pending-image-preview') as HTMLImageElement).src;

    fireEvent.error(view.getByTestId('pending-image-preview'));

    expect((view.getByAltText(image.file_name) as HTMLImageElement).src).toBe(initialUrl);
    expect(view.getByText('Could not render the image preview.')).toBeTruthy();
    expect(view.queryByRole('status', { name: 'Loading image preview' })).toBeNull();

    await userEvent.click(view.getByRole('button', { name: 'Retry preview' }));

    expect((view.getByTestId('pending-image-preview') as HTMLImageElement).src).not.toBe(failedUrl);
    expect(view.getByRole('status', { name: 'Loading image preview' })).toBeTruthy();
  });
});
