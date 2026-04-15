import React, { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useImageStore } from '../stores/imageStore';
import { TagInput } from './TagInput';

export function SearchBar() {
  const { searchQuery, setSearchQuery, dateRange, setDateRange, tagFilters, setTagFilters, clearFilters } = useUIStore();
  const { searchImages, loading } = useImageStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== searchQuery) {
        setSearchQuery(localQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, setSearchQuery, searchQuery]);

  const handleSearch = useCallback(() => {
    if (localQuery.trim()) {
      searchImages(localQuery);
    }
  }, [localQuery, searchImages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newDate = value ? new Date(value) : null;
    setDateRange({
      ...dateRange,
      [field]: newDate,
    });
  };

  return (
    <div className="w-full p-4 bg-white shadow rounded-lg">
      <div className="flex flex-col space-y-4">
        {/* Main search input */}
        <div className="flex items-center space-x-2">
          <div className="flex-1 relative">
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search by natural language (e.g., 'photos of mountains at sunset')"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {loading && (
              <div className="absolute right-3 top-2.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Search
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {showAdvanced ? 'Simple' : 'Advanced'}
          </button>
          <button
            onClick={clearFilters}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            {/* Tag filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by tags
              </label>
              <TagInput
                selectedTags={tagFilters}
                onChange={setTagFilters}
                placeholder="Add tags to filter..."
              />
            </div>

            {/* Date range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date range
              </label>
              <div className="flex space-x-2">
                <div className="flex-1">
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleDateChange('start', e.target.value)}
                  />
                  <div className="text-xs text-gray-500 mt-1">Start date</div>
                </div>
                <div className="flex-1">
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                  />
                  <div className="text-xs text-gray-500 mt-1">End date</div>
                </div>
              </div>
            </div>

            {/* Toggle filters */}
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 rounded"
                  checked={true}
                  onChange={() => {}}
                />
                <span className="ml-2 text-sm text-gray-700">Show AI suggestions</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 rounded"
                  checked={false}
                  onChange={() => {}}
                />
                <span className="ml-2 text-sm text-gray-700">Show hidden images</span>
              </label>
            </div>
          </div>
        )}

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">Try:</span>
          {['landscape', 'portrait', 'sunset', 'beach', 'family', 'vacation'].map((term) => (
            <button
              key={term}
              onClick={() => setLocalQuery(term)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
            >
              {term}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}