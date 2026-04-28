import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from '../../stores/toastStore';
import { showIpcError } from '../../ipc';

interface ActiveImageQueryInput {
  bytes: Uint8Array;
  previewUrl: string;
}

interface ReverseImageSearchOptions {
  embedderReady: boolean;
  embedderWarming: boolean;
  setSearchQuery: (value: string) => void;
  setActiveImageQuery: (entry: ActiveImageQueryInput) => void;
}

interface ReverseImageSearchState {
  isDragActive: boolean;
  handleDragEnter: (event: DragEvent) => void;
  handleDragOver: (event: DragEvent) => void;
  handleDragLeave: (event: DragEvent) => void;
  handleDrop: (event: DragEvent) => void;
  handlePaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}

function hasFiles(types: readonly string[]): boolean {
  return types.includes('Files');
}

export function useReverseImageSearch({
  embedderReady,
  embedderWarming,
  setSearchQuery,
  setActiveImageQuery,
}: ReverseImageSearchOptions): ReverseImageSearchState {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  const runImageSearch = useCallback(
    async (file: File) => {
      if (!embedderReady) {
        toast.error(
          embedderWarming
            ? 'Search model is still warming up — try again in a moment.'
            : 'Search unavailable.',
        );
        return;
      }

      const maxBytes = 25 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error(`Image too large (${Math.round(file.size / 1024 / 1024)}MB, max 25MB)`);
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const previewUrl = URL.createObjectURL(file);
        setSearchQuery('');
        // The store owns previewUrl from here on and revokes it on clear.
        setActiveImageQuery({ bytes, previewUrl });
      } catch (error) {
        showIpcError(error, 'Reverse image search failed');
      }
    },
    [embedderReady, embedderWarming, setActiveImageQuery, setSearchQuery],
  );

  const handleDragEnter = useCallback((event: DragEvent) => {
    if (!hasFiles(Array.from(event.dataTransfer.types))) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    if (!hasFiles(Array.from(event.dataTransfer.types))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (!hasFiles(Array.from(event.dataTransfer.types))) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      dragCounterRef.current = 0;
      setIsDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;

      // Only preventDefault once we've decided to handle it so other future
      // drop targets can still receive non-image payloads.
      event.preventDefault();
      void runImageSearch(file);
    },
    [runImageSearch],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;

        const file = item.getAsFile();
        if (!file) return;
        event.preventDefault();
        void runImageSearch(file);
        return;
      }
    },
    [runImageSearch],
  );

  return {
    isDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
  };
}
