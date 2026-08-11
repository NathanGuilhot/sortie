import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { Image } from 'shared';
import { useImageDragOut } from '../useImageDragOut';
import { installSortieAPIStub } from '../../test/sortieApiStub';

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

const prepareImageDrag = vi.fn(() => Promise.resolve({ success: true }));
const startImageDrag = vi.fn(() => Promise.resolve({ success: true }));

function Tile({ target, onSelect }: { target: Image; onSelect: () => void }) {
  const { dragProps, consumeDidDrag } = useImageDragOut(target);
  return (
    <div
      data-testid="tile"
      {...dragProps}
      onClick={() => {
        if (consumeDidDrag()) return;
        onSelect();
      }}
    />
  );
}

describe('useImageDragOut', () => {
  beforeEach(() => {
    prepareImageDrag.mockClear();
    startImageDrag.mockClear();
    installSortieAPIStub({ prepareImageDrag, startImageDrag });
  });

  afterEach(cleanup);

  it('warms the drag caches on mousedown, before the gesture starts', () => {
    const { getByTestId } = render(<Tile target={image} onSelect={() => {}} />);

    fireEvent.mouseDown(getByTestId('tile'));

    expect(prepareImageDrag).toHaveBeenCalledWith('/photos/a.jpg');
    expect(startImageDrag).not.toHaveBeenCalled();
  });

  it('cancels the HTML5 drag and hands over to the native one', () => {
    const { getByTestId } = render(<Tile target={image} onSelect={() => {}} />);

    const notPrevented = fireEvent.dragStart(getByTestId('tile'));

    expect(notPrevented).toBe(false);
    expect(startImageDrag).toHaveBeenCalledWith('/photos/a.jpg');
  });

  it('does not open the image when the gesture turned into a drag', () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(<Tile target={image} onSelect={onSelect} />);
    const tile = getByTestId('tile');

    fireEvent.mouseDown(tile);
    fireEvent.dragStart(tile);
    fireEvent.click(tile);

    expect(onSelect).not.toHaveBeenCalled();

    // The next plain click is unaffected.
    fireEvent.mouseDown(tile);
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('leaves images whose file is gone undraggable', () => {
    const { getByTestId } = render(
      <Tile target={{ ...image, missing: true }} onSelect={() => {}} />,
    );

    expect(getByTestId('tile').getAttribute('draggable')).toBe('false');
    fireEvent.mouseDown(getByTestId('tile'));
    expect(prepareImageDrag).not.toHaveBeenCalled();
  });

  it('ignores non-primary buttons', () => {
    const { getByTestId } = render(<Tile target={image} onSelect={() => {}} />);

    fireEvent.mouseDown(getByTestId('tile'), { button: 2 });

    expect(prepareImageDrag).not.toHaveBeenCalled();
  });
});
