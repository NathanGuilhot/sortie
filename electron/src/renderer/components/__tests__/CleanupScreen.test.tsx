import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DuplicateGroup, Image } from 'shared';
import { DuplicateGroupCard } from '../CleanupScreen';
import { useFolderStore } from '../../stores/folderStore';

const images = [1, 2, 3].map((id) => ({
  id,
  file_path: `/images/${id}.png`,
  file_name: `${id}.png`,
  width: 100,
  height: 200,
  file_size: 1000,
})) as Image[];
const group: DuplicateGroup = { groupId: 'group', matchType: 'visual', images };

afterEach(() => {
  cleanup();
  useFolderStore.setState({ folders: [] });
});

describe('minimal duplicate review', () => {
  it('requires selection and confirms the removal count without paths or format-specific actions', () => {
    const onKeep = vi.fn();
    render(<DuplicateGroupCard group={group} busy={false} onKeep={onKeep} onDismiss={vi.fn()} />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Keep selected' }).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Keep image 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep selected' }));
    expect(onKeep).not.toHaveBeenCalled();
    expect(
      screen.getByText('Keep the selected image and move 2 other images to Trash?'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move 2 to Trash' }));
    expect(onKeep).toHaveBeenCalledWith('group', 2);
    expect(screen.queryByText(/images\//)).toBeNull();
    expect(screen.queryByText(/Preserve/)).toBeNull();
    expect(screen.queryByText(/WebP/)).toBeNull();
  });

  it('supports keeping a read-only image while only offering writable removals', () => {
    useFolderStore.setState({
      folders: [{ id: 1, path: '/images/1.png', writable: false, available: true }] as never,
    });
    const onDismiss = vi.fn();
    render(
      <DuplicateGroupCard group={group} busy={false} onKeep={vi.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Keep image 1' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Keep selected' }).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }));
    expect(onDismiss).toHaveBeenCalledWith('group');
  });
});
