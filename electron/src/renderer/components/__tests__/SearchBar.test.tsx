import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '../SearchBar';
import { useEmbedderStore } from '../../stores/embedderStore';
import { useImageStore } from '../../stores/imageStore';
import { useUIStore } from '../../stores/uiStore';

function resetUiStore() {
  useUIStore.setState({
    searchQuery: '',
    dateRange: { start: null, end: null },
    tagFilters: [],
    showHidden: false,
    showFavoritesOnly: false,
    personFilter: null,
    folderFilter: null,
    paletteFilters: [],
  });
}

describe('SearchBar', () => {
  afterEach(() => {
    resetUiStore();
    useImageStore.setState({ loading: false, activeImageQuery: null });
    useEmbedderStore.setState({ status: { state: 'idle' } });
  });

  it('keeps the input controlled by search state and clears it from the clear control', async () => {
    const user = userEvent.setup();
    const { getByPlaceholderText, getByRole, getByText } = render(<SearchBar />);
    const input = getByPlaceholderText('Search photos...') as HTMLInputElement;

    await user.click(input);
    expect(getByText('Suggestions')).toBeTruthy();
    await user.type(input, 'sunset');

    expect(input.value).toBe('sunset');
    expect(useUIStore.getState().searchQuery).toBe('sunset');

    await user.click(getByRole('button', { name: 'Clear search' }));
    expect(input.value).toBe('');
    expect(useUIStore.getState().searchQuery).toBe('');
  });
});
