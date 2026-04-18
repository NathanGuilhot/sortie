import React, { useState, useCallback, useEffect, useRef, RefObject } from 'react';
import { Person } from 'shared';
import { useUIStore } from '../stores/uiStore';
import { useImageStore } from '../stores/imageStore';
import { useEmbedderStore } from '../stores/embedderStore';
import { TagInput } from './TagInput';
import { buildFaceThumbUrl } from './faceThumb';

interface SearchBarProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}

const SUGGESTIONS = ['landscape', 'portrait', 'sunset', 'beach', 'family', 'vacation'];

function PersonFilterChip({
  person,
  selected,
  onToggle,
}: {
  person: Person;
  selected: boolean;
  onToggle: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!person.thumbnail_face_id) return;
    let cancelled = false;
    window.sortieAPI
      .getPersonImages(person.id, 1)
      .then(async (images) => {
        if (cancelled || images.length === 0) return;
        const faces = await window.sortieAPI.getImageFaces(images[0].id);
        const personFace = faces.find((f) => f.person_id === person.id);
        if (!cancelled && personFace) setThumbUrl(buildFaceThumbUrl(personFace));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [person.id, person.thumbnail_face_id]);

  const label = person.name || `Person ${person.id}`;

  return (
    <button
      onClick={onToggle}
      title={`${label} (${person.face_count})`}
      className={`relative w-10 h-10 rounded-full overflow-hidden transition-all ${
        selected
          ? 'ring-2 ring-ink ring-offset-2'
          : 'ring-1 ring-gray-200 hover:ring-gray-400'
      }`}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={label} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

export function SearchBar({ inputRef, scrollContainerRef }: SearchBarProps) {
  const {
    searchQuery,
    setSearchQuery,
    dateRange,
    setDateRange,
    tagFilters,
    setTagFilters,
    showHidden,
    setShowHidden,
    showFavoritesOnly,
    setShowFavoritesOnly,
    personFilter,
    setPersonFilter,
    clearFilters,
  } = useUIStore();
  const { searchImages, fetchImages, filterByTags, filterByPerson, fetchFavorites, loading } =
    useImageStore();
  const embedderStatus = useEmbedderStore((s) => s.status);

  const [persons, setPersons] = useState<Person[]>([]);

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Load persons list for the filter dropdown
  useEffect(() => {
    window.sortieAPI.getPersons().then(setPersons).catch(() => {});
  }, []);

  // React to person filter changes
  useEffect(() => {
    if (personFilter !== null) {
      void filterByPerson(personFilter);
    } else if (tagFilters.length > 0) {
      void filterByTags(tagFilters);
    } else if (!showFavoritesOnly && !localQuery.trim()) {
      void fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personFilter]);

  const hasActiveFilters =
    tagFilters.length > 0 ||
    dateRange.start !== null ||
    dateRange.end !== null ||
    showHidden ||
    showFavoritesOnly ||
    personFilter !== null;

  // Debounce search query to store
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery, searchQuery]);

  // React to tag filter changes
  useEffect(() => {
    if (showFavoritesOnly) return; // favorites filter takes precedence
    if (tagFilters.length > 0) {
      void filterByTags(tagFilters);
    } else if (!localQuery.trim()) {
      void fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilters]);

  // React to favorites filter changes
  useEffect(() => {
    if (showFavoritesOnly) {
      void fetchFavorites();
    } else if (tagFilters.length > 0) {
      void filterByTags(tagFilters);
    } else if (!localQuery.trim()) {
      void fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFavoritesOnly]);

  // Click-outside dismissal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setShowAdvanced(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(() => {
    scrollContainerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (localQuery.trim()) {
      void searchImages(localQuery);
    } else {
      clearFilters();
      void fetchImages();
    }
  }, [localQuery, searchImages, clearFilters, fetchImages, scrollContainerRef]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    clearFilters();
    void fetchImages();
    scrollContainerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
    inputRef?.current?.focus();
  }, [clearFilters, fetchImages, inputRef, scrollContainerRef]);

  const handleFocus = () => {
    clearTimeout(blurTimeoutRef.current);
    setIsFocused(true);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setIsFocused(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      setIsFocused(false);
      setShowAdvanced(false);
      inputRef?.current?.blur();
    }
  };

  const handleSuggestionClick = (term: string) => {
    setLocalQuery(term);
    setSearchQuery(term);
    void searchImages(term);
    setIsFocused(false);
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newDate = value ? new Date(value) : null;
    setDateRange({
      ...dateRange,
      [field]: newDate,
    });
  };

  const showSuggestions = isFocused && !localQuery;
  const showDropdown = showSuggestions || showAdvanced;

  return (
    <div
      ref={containerRef}
      className="fixed top-4 left-1/2 -translate-x-1/2 ml-8 z-20 w-full max-w-xl px-4"
    >
      {/* Input bar */}
      <div
        className={`
          flex items-center h-11 px-4 rounded-2xl border transition-all duration-200
          ${
            isFocused
              ? 'bg-white shadow-xl border-gray-300'
              : 'bg-white/80 backdrop-blur-lg shadow-lg shadow-black/5 border-gray-200/60'
          }
        `}
      >
        <svg
          className="w-4 h-4 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 ml-3"
          placeholder="Search photos..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />

        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-gray-600 shrink-0" />
        )}

        {localQuery && (
          <button
            onClick={handleClear}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}

        {/* Filter toggle */}
        {(isFocused || hasActiveFilters) && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-1 rounded-full transition-colors shrink-0 ml-1 relative ${
              showAdvanced
                ? 'bg-gray-100 text-gray-700'
                : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            {hasActiveFilters && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-coral rounded-full" />
            )}
          </button>
        )}

        {/* Cmd+K hint */}
        {!isFocused && !localQuery && (
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 rounded border border-gray-200 ml-2 shrink-0">
            <span className="text-[10px]">&#8984;K</span>
          </kbd>
        )}
      </div>

      {/* Embedder status strip */}
      {embedderStatus.state === 'warming' && (
        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-lg border border-gray-200/60 shadow text-xs text-gray-500 w-fit mx-auto">
          <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-300 border-t-gray-500" />
          <span>Loading search model…</span>
        </div>
      )}
      {embedderStatus.state === 'error' && (
        <div className="mt-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-xs text-red-700 w-fit mx-auto">
          Search unavailable: {embedderStatus.message}
        </div>
      )}

      {/* Dropdown panel */}
      {showDropdown && (
        <div className="mt-2 bg-white rounded-2xl border border-gray-200/60 shadow-xl shadow-black/5 overflow-hidden animate-dropdown-in">
          {/* Suggestion pills — only when focused and no query */}
          {isFocused && !localQuery && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Suggestions</span>
              {SUGGESTIONS.map((term) => (
                <button
                  key={term}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSuggestionClick(term)}
                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          )}

          {/* Advanced filters */}
          {showAdvanced && (
            <div
              className={`px-4 py-3 space-y-3 ${isFocused && !localQuery ? 'border-t border-gray-100' : ''}`}
            >
              {/* Tag filters */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Filter by tags
                </label>
                <TagInput
                  selectedTags={tagFilters}
                  onChange={setTagFilters}
                  placeholder="Add tags..."
                />
              </div>

              {/* Person filter */}
              {persons.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Filter by person
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {persons.map((p) => (
                      <PersonFilterChip
                        key={p.id}
                        person={p}
                        selected={personFilter === p.id}
                        onToggle={() =>
                          setPersonFilter(personFilter === p.id ? null : p.id)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Date range */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date range</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                  />
                  <span className="text-gray-300 self-center text-xs">to</span>
                  <input
                    type="date"
                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                  />
                </div>
              </div>

              {/* Toggle filters */}
              <div className="flex gap-4">
                <button
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className="flex items-center gap-1.5 cursor-pointer"
                  title="Favorites only"
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      showFavoritesOnly ? 'bg-coral' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill={showFavoritesOnly ? 'white' : 'none'}
                      stroke={showFavoritesOnly ? 'none' : 'currentColor'}
                      strokeWidth={showFavoritesOnly ? 0 : 2}
                      className={showFavoritesOnly ? '' : 'text-gray-500'}
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                  <span className="text-xs text-gray-600">Favorites</span>
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 text-ink rounded border-gray-300"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                  />
                  <span className="text-xs text-gray-600">Hidden images</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
