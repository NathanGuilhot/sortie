import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { type EmbedderStatus } from 'shared';
import { useReverseImageSearch } from './useReverseImageSearch';
import { useEmbedderStore } from '../../stores/embedderStore';
import { useImageStore } from '../../stores/imageStore';
import { useUIStore } from '../../stores/uiStore';

interface UseGallerySearchBarOptions {
  inputRef?: MutableRefObject<HTMLInputElement | null>;
}

interface GallerySearchBarState {
  activeImageQuery: ReturnType<typeof useImageStore.getState>['activeImageQuery'];
  embedderStatus: EmbedderStatus;
  hasActiveFilters: boolean;
  isDragActive: boolean;
  isFocused: boolean;
  loading: boolean;
  localQuery: string;
  showAdvanced: boolean;
  showDropdown: boolean;
  containerRef: RefObject<HTMLDivElement>;
  handleBlur: () => void;
  handleClear: () => void;
  handleClearImageQuery: () => void;
  handleDragEnter: (event: React.DragEvent) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleFocus: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  handlePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void;
  handleSuggestionClick: (term: string) => void;
  setLocalQuery: (value: string) => void;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useGallerySearchBar({
  inputRef,
}: UseGallerySearchBarOptions): GallerySearchBarState {
  const {
    searchQuery,
    setSearchQuery,
    dateRange,
    tagFilters,
    showHidden,
    showFavoritesOnly,
    personFilter,
    folderFilter,
    paletteFilters,
    clearFilters,
  } = useUIStore();
  const loading = useImageStore((state) => state.loading);
  const setActiveImageQuery = useImageStore((state) => state.setActiveImageQuery);
  const clearImageQuery = useImageStore((state) => state.clearImageQuery);
  const activeImageQuery = useImageStore((state) => state.activeImageQuery);
  const embedderStatus = useEmbedderStore((state) => state.status);

  const localQuery = searchQuery;
  const setLocalQuery = setSearchQuery;
  const [isFocused, setIsFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const hasActiveFilters =
    tagFilters.length > 0 ||
    dateRange.start !== null ||
    dateRange.end !== null ||
    showHidden ||
    showFavoritesOnly ||
    personFilter !== null ||
    folderFilter !== null ||
    paletteFilters.length > 0;

  const {
    isDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
  } = useReverseImageSearch({
    embedderReady: embedderStatus.state === 'ready',
    embedderWarming: embedderStatus.state === 'warming',
    setSearchQuery: (value) => {
      setLocalQuery(value);
      setSearchQuery(value);
    },
    setActiveImageQuery,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        setShowAdvanced(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(() => {
    if (localQuery.trim()) {
      setSearchQuery(localQuery);
      return;
    }

    clearFilters();
    setLocalQuery('');
  }, [clearFilters, localQuery, setLocalQuery, setSearchQuery]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    clearFilters();
    inputRef?.current?.focus();
  }, [clearFilters, inputRef, setLocalQuery]);

  const handleClearImageQuery = useCallback(() => {
    clearImageQuery();
    inputRef?.current?.focus();
  }, [clearImageQuery, inputRef]);

  const handleFocus = useCallback(() => {
    clearTimeout(blurTimeoutRef.current);
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => setIsFocused(false), 150);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleSearch();
      }
      if (event.key === 'Escape') {
        setIsFocused(false);
        setShowAdvanced(false);
        inputRef?.current?.blur();
      }
    },
    [handleSearch, inputRef],
  );

  const handleSuggestionClick = useCallback(
    (term: string) => {
      setLocalQuery(term);
      setSearchQuery(term);
      setIsFocused(false);
    },
    [setLocalQuery, setSearchQuery],
  );

  const showSuggestions = isFocused && !localQuery;

  return {
    activeImageQuery,
    embedderStatus,
    hasActiveFilters,
    isDragActive,
    isFocused,
    loading,
    localQuery: activeImageQuery ? '' : localQuery,
    showAdvanced,
    showDropdown: showSuggestions || showAdvanced,
    containerRef,
    handleBlur,
    handleClear,
    handleClearImageQuery,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFocus,
    handleKeyDown,
    handlePaste,
    handleSuggestionClick,
    setLocalQuery,
    setShowAdvanced,
  };
}
