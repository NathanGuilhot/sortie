import React, { useState, useCallback, useEffect, useMemo, useRef, RefObject } from 'react';
import { Person, FolderWithStats, Query } from 'shared';
import { useUIStore } from '../stores/uiStore';
import { useImageStore } from '../stores/imageStore';
import { useEmbedderStore } from '../stores/embedderStore';
import { toast } from '../stores/toastStore';
import { TagInput } from './TagInput';
import { PaletteSearchPicker } from './PaletteSearchPicker';
import { buildFaceThumbUrl } from './faceThumb';
import { SearchIcon, PersonIcon, XIcon, FilterIcon, HeartIcon } from './icons';

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
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load person thumbnail: ${message}`);
      });
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
        selected ? 'ring-2 ring-ink ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'
      }`}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={label} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
          <PersonIcon className="w-5 h-5" />
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
    folderFilter,
    setFolderFilter,
    paletteFilters,
    setPaletteFilters,
    clearFilters,
  } = useUIStore();
  const { runQuery, setActiveImageQuery, clearImageQuery, loading } = useImageStore();
  const activeImageQuery = useImageStore((s) => s.activeImageQuery);
  const embedderStatus = useEmbedderStore((s) => s.status);

  const [persons, setPersons] = useState<Person[]>([]);
  const [folders, setFolders] = useState<FolderWithStats[]>([]);

  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const dragCounterRef = useRef(0);

  // Load persons list for the filter dropdown
  useEffect(() => {
    window.sortieAPI
      .getPersons()
      .then(setPersons)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load people: ${message}`);
      });
  }, []);

  // Load folders list for the filter dropdown
  useEffect(() => {
    window.sortieAPI
      .getFoldersWithStats()
      .then(setFolders)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load folders: ${message}`);
      });
  }, []);

  const hasActiveFilters =
    tagFilters.length > 0 ||
    dateRange.start !== null ||
    dateRange.end !== null ||
    showHidden ||
    showFavoritesOnly ||
    personFilter !== null ||
    folderFilter !== null ||
    paletteFilters.length > 0;

  // Debounce search query to store
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery, searchQuery]);

  // AND-compose every active filter into one Query.
  const dateStart = dateRange.start ? dateRange.start.toISOString() : null;
  const dateEnd = dateRange.end ? dateRange.end.toISOString() : null;
  const imageBytes = activeImageQuery?.bytes ?? null;

  const builtQuery = useMemo<Query>(() => {
    const q: Query = {};
    const text = searchQuery.trim();
    if (imageBytes) q.imageBytes = imageBytes;
    else if (text) q.text = text;
    if (personFilter !== null) q.personId = personFilter;
    if (folderFilter !== null) q.folderId = folderFilter;
    if (tagFilters.length > 0) q.tags = tagFilters;
    if (paletteFilters.length > 0) q.palette = paletteFilters;
    if (showFavoritesOnly) q.favorites = true;
    if (showHidden) q.includeHidden = true;
    if (dateStart || dateEnd) q.dateRange = { start: dateStart, end: dateEnd };
    return q;
  }, [
    searchQuery,
    imageBytes,
    personFilter,
    folderFilter,
    tagFilters,
    paletteFilters,
    showFavoritesOnly,
    showHidden,
    dateStart,
    dateEnd,
  ]);

  useEffect(() => {
    void runQuery(builtQuery);
    scrollContainerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtQuery]);

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
    if (localQuery.trim()) {
      setSearchQuery(localQuery);
    } else {
      clearFilters();
      setLocalQuery('');
    }
  }, [localQuery, setSearchQuery, clearFilters]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    clearFilters();
    inputRef?.current?.focus();
  }, [clearFilters, inputRef]);

  const runImageSearch = useCallback(
    async (file: File) => {
      if (embedderStatus.state !== 'ready') {
        toast.error(
          embedderStatus.state === 'warming'
            ? 'Search model is still warming up — try again in a moment.'
            : 'Search unavailable.',
        );
        return;
      }
      const MAX = 25 * 1024 * 1024;
      if (file.size > MAX) {
        toast.error(`Image too large (${Math.round(file.size / 1024 / 1024)}MB, max 25MB)`);
        return;
      }
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const previewUrl = URL.createObjectURL(file);
        setLocalQuery('');
        setSearchQuery('');
        // The store owns previewUrl from here on and revokes it on clear.
        setActiveImageQuery({ bytes, previewUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Reverse image search failed: ${message}`);
      }
    },
    [embedderStatus, setActiveImageQuery, setSearchQuery],
  );

  const handleClearImageQuery = useCallback(() => {
    clearImageQuery();
    inputRef?.current?.focus();
  }, [clearImageQuery, inputRef]);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    // Only preventDefault once we've decided to handle it — non-image drops
    // fall through so we don't break any other drop targets that may appear.
    e.preventDefault();
    void runImageSearch(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void runImageSearch(file);
          return;
        }
      }
    }
    // No image in clipboard — let the normal text paste happen.
  };

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
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Input bar */}
      <div
        className={`
          flex items-center h-11 px-4 rounded-2xl border transition-all duration-200
          ${
            isDragActive
              ? 'bg-white shadow-xl border-dashed border-ink ring-2 ring-ink/10'
              : isFocused
                ? 'bg-white shadow-xl border-gray-300'
                : 'bg-white/95 shadow-lg shadow-black/5 border-gray-200/60'
          }
        `}
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
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400 ml-3"
          placeholder={
            isDragActive
              ? 'Drop image to search similar…'
              : activeImageQuery
                ? 'Similar to image'
                : 'Search photos...'
          }
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
            <FilterIcon />
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
        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 border border-gray-200/60 shadow text-xs text-gray-500 w-fit mx-auto">
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
        <div className="mt-2 bg-white rounded-2xl border border-gray-200/60 shadow-xl shadow-black/5 animate-dropdown-in">
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
              {/* Folder filter */}
              {folders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    Filter by folder
                  </label>
                  <select
                    value={folderFilter ?? ''}
                    onChange={(e) =>
                      setFolderFilter(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
                  >
                    <option value="">All folders</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.folder_name} ({f.image_count})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Board filters */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Filter by board
                </label>
                <TagInput
                  selectedTags={tagFilters}
                  onChange={setTagFilters}
                  placeholder="Add boards..."
                  suggestionCategories={['user', 'ai']}
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
                        onToggle={() => setPersonFilter(personFilter === p.id ? null : p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Color palette */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Filter by color
                </label>
                <PaletteSearchPicker colors={paletteFilters} onChange={setPaletteFilters} />
              </div>

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
                    <HeartIcon
                      className={`w-[11px] h-[11px] ${showFavoritesOnly ? 'text-white' : 'text-gray-500'}`}
                      filled={showFavoritesOnly}
                      strokeWidth={showFavoritesOnly ? 0 : 2}
                    />
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
