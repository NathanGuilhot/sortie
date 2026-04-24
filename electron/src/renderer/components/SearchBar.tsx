import React, { type MutableRefObject, type RefObject } from 'react';
import { type EmbedderStatus } from 'shared';
import { SearchIcon, XIcon, FilterIcon } from './icons';
import { SearchBarAdvancedFilters } from './searchBar/SearchBarAdvancedFilters';
import { useGallerySearchBar } from './searchBar/useGallerySearchBar';

interface SearchBarProps {
  inputRef?: MutableRefObject<HTMLInputElement | null>;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

const SUGGESTIONS = ['landscape', 'portrait', 'sunset', 'beach', 'family', 'vacation'];

export function SearchBar({ inputRef, scrollContainerRef }: SearchBarProps) {
  const {
    activeImageQuery,
    containerRef,
    embedderStatus,
    handleBlur,
    handleClear,
    handleClearImageQuery,
    isDragActive,
    isFocused,
    loading,
    localQuery,
    showAdvanced,
    showDropdown,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFocus,
    handleKeyDown,
    handlePaste,
    handleSuggestionClick,
    hasActiveFilters,
    setLocalQuery,
    setShowAdvanced,
  } = useGallerySearchBar({
    inputRef,
    scrollContainerRef,
  });

  return (
    <div
      ref={containerRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 ml-8 z-20 w-full max-w-xl px-4"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={getSearchBarShellClassName({
          isDragActive,
          isFocused,
        })}
      >
        {activeImageQuery ? (
          <img
            src={activeImageQuery.previewUrl}
            alt="Query image"
            className="w-6 h-6 rounded object-cover shrink-0"
          />
        ) : (
          <SearchIcon className="w-4 h-4 text-gray-400 shrink-0" />
        )}

        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 ml-3"
          placeholder={getSearchPlaceholder({ activeImageQuery: !!activeImageQuery, isDragActive })}
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={!!activeImageQuery}
        />

        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 shrink-0" />
        )}

        {activeImageQuery && (
          <button
            onClick={handleClearImageQuery}
            title="Clear image search"
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
          >
            <XIcon />
          </button>
        )}

        {localQuery && (
          <button
            onClick={handleClear}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
          >
            <XIcon />
          </button>
        )}

        {(isFocused || hasActiveFilters) && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-1 rounded-full transition-colors shrink-0 ml-1 relative ${
              showAdvanced
                ? 'bg-gray-100 text-gray-700'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            }`}
          >
            <FilterIcon />
            {hasActiveFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-coral rounded-full" />
            )}
          </button>
        )}

        {!isFocused && !localQuery && (
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200 ml-2 shrink-0">
            <span className="text-[10px]">&#8984;K</span>
          </kbd>
        )}
      </div>

      <SearchStatusNotice embedderStatus={embedderStatus} />

      {showDropdown && (
        <div className="mt-2 bg-white rounded-2xl border border-gray-200/60 shadow-xl shadow-black/5 animate-dropdown-in">
          {isFocused && !localQuery && (
            <SearchSuggestions onSelect={handleSuggestionClick} />
          )}

          {showAdvanced && (
            <SearchBarAdvancedFilters showDivider={isFocused && !localQuery} />
          )}
        </div>
      )}
    </div>
  );
}

function SearchSuggestions({ onSelect }: { onSelect: (term: string) => void }) {
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400">Suggestions</span>
      {SUGGESTIONS.map((term) => (
        <button
          key={term}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(term)}
          className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
        >
          {term}
        </button>
      ))}
    </div>
  );
}

function SearchStatusNotice({
  embedderStatus,
}: {
  embedderStatus: EmbedderStatus;
}) {
  if (embedderStatus.state === 'warming') {
    return (
      <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 border border-gray-200/60 shadow text-xs text-gray-500 w-fit mx-auto">
        <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-gray-500" />
        <span>Loading search model…</span>
      </div>
    );
  }

  if (embedderStatus.state !== 'error') {
    return null;
  }

  return (
    <div className="mt-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs text-red-700 w-fit mx-auto">
      Search unavailable: {embedderStatus.message}
    </div>
  );
}

function getSearchBarShellClassName({
  isDragActive,
  isFocused,
}: {
  isDragActive: boolean;
  isFocused: boolean;
}): string {
  if (isDragActive) {
    return 'flex items-center h-11 px-4 rounded-2xl border transition-all duration-200 bg-white shadow-xl border-dashed border-ink ring-2 ring-ink/10';
  }

  if (isFocused) {
    return 'flex items-center h-11 px-4 rounded-2xl border transition-all duration-200 bg-white shadow-xl border-gray-300';
  }

  return (
    'flex items-center h-11 px-4 rounded-2xl border transition-all duration-200 bg-white/95 shadow-lg shadow-black/5 border-gray-200/60'
  );
}

function getSearchPlaceholder({
  activeImageQuery,
  isDragActive,
}: {
  activeImageQuery: boolean;
  isDragActive: boolean;
}): string {
  if (isDragActive) return 'Drop image to search similar…';
  if (activeImageQuery) return 'Similar to image';
  return 'Search photos...';
}
