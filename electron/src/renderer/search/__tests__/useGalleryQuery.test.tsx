import { StrictMode, createRef, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGalleryQuery } from '../useGalleryQuery';
import { useImageStore } from '../../stores/imageStore';
import { useUIStore } from '../../stores/uiStore';

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe('useGalleryQuery', () => {
  let runQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    runQuery = vi.fn().mockResolvedValue(undefined);
    useImageStore.setState({ runQuery, activeImageQuery: null });
    useUIStore.setState({ searchQuery: '' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('runs the first query immediately, even under StrictMode', () => {
    renderHook(() => useGalleryQuery(createRef<HTMLDivElement>()), { wrapper: strict });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(runQuery).toHaveBeenCalledTimes(1);
  });
});
