import { BookIcon, FilterIcon, XIcon } from '../components/icons';

import type { FormEvent, KeyboardEvent, RefObject } from 'react';

interface ImportSearchBarProps {
  containerRef: RefObject<HTMLDivElement>;
  inputRef: RefObject<HTMLInputElement>;
  input: string;
  loading: boolean;
  isFocused: boolean;
  hasActiveFilters: boolean;
  showFilters: boolean;
  showDropdown: boolean;
  hideAiGenerated: boolean;
  onSubmit: (event: FormEvent) => void;
  onInputChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onClear: () => void;
  onToggleFilters: () => void;
  onSetHideAiGenerated: (hidden: boolean) => void;
}

export function ImportSearchBar({
  containerRef,
  inputRef,
  input,
  loading,
  isFocused,
  hasActiveFilters,
  showFilters,
  showDropdown,
  hideAiGenerated,
  onSubmit,
  onInputChange,
  onFocus,
  onBlur,
  onKeyDown,
  onClear,
  onToggleFilters,
  onSetHideAiGenerated,
}: ImportSearchBarProps) {
  return (
    <div
      ref={containerRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 ml-8 z-20 w-full max-w-xl px-4"
    >
      <form
        onSubmit={onSubmit}
        className={`flex items-center h-11 px-4 rounded-2xl border transition-all duration-200 ${
          isFocused
            ? 'bg-white shadow-xl border-gray-300'
            : 'bg-white/80 backdrop-blur-lg shadow-lg shadow-black/5 border-gray-200/60'
        }`}
      >
        <BookIcon className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />

        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 ml-3"
          placeholder="Search Pinterest or paste a board URL..."
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />

        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 shrink-0" />
        )}

        {input && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
            title="Clear"
          >
            <XIcon />
          </button>
        )}

        {(isFocused || hasActiveFilters) && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleFilters}
            className={`p-1 rounded-full transition-colors shrink-0 ml-1 relative ${
              showFilters
                ? 'bg-gray-100 text-gray-700'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            }`}
            title="Filters"
            aria-expanded={showFilters}
          >
            <FilterIcon />
            {hasActiveFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-coral rounded-full" />
            )}
          </button>
        )}

        {!isFocused && !input && (
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200 ml-2 shrink-0">
            <span className="text-[10px]">&#8984;K</span>
          </kbd>
        )}
      </form>

      {showDropdown && (
        <div className="mt-2 bg-white rounded-2xl border border-gray-200/60 shadow-xl shadow-black/5 overflow-hidden animate-dropdown-in">
          <div className="px-4 py-3 space-y-3">
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 text-ink rounded border-gray-300"
                  checked={hideAiGenerated}
                  onChange={(event) => onSetHideAiGenerated(event.target.checked)}
                />
                <span className="text-xs text-gray-600">Hide AI-generated</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
