import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardExportModal } from '../BoardExportModal';

afterEach(cleanup);

describe('BoardExportModal', () => {
  it('shows determinate progress and allows cancellation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const view = render(
      <BoardExportModal
        boardName="References"
        progress={{ opId: 'export-1', current: 4, total: 10, currentFile: 'photo.raw' }}
        cancelling={false}
        failures={null}
        onCancel={onCancel}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(view.getByRole('dialog', { name: 'Exporting References' })).toBeTruthy();
    expect(view.getByText('photo.raw')).toBeTruthy();
    expect(view.getByText('4 / 10')).toBeTruthy();
    await user.click(view.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('lists every failure and exposes retry and close actions', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <BoardExportModal
        boardName="References"
        progress={null}
        cancelling={false}
        failures={[
          { fileName: 'gone.jpg', reason: 'File not found' },
          { fileName: 'private.raw', reason: 'Permission denied' },
        ]}
        onCancel={vi.fn()}
        onRetry={onRetry}
        onClose={onClose}
      />,
    );

    expect(view.getByText('gone.jpg')).toBeTruthy();
    expect(view.getByText('private.raw')).toBeTruthy();
    await user.click(view.getByRole('button', { name: 'Retry' }));
    await user.click(view.getByRole('button', { name: 'Close' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
