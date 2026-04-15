import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { useCallback } from 'react';

export function useSearch() {
  const { searchImages, searchResults, loading, error } = useImageStore();
  const { searchQuery, dateRange, tagFilters, showAIResults, showHidden } = useUIStore();

  const search = useCallback(() => {
    if (searchQuery.trim() === '') {
      // If empty query, we could fetch regular images
      return;
    }
    searchImages(searchQuery);
  }, [searchQuery, searchImages]);

  return { 
    search, 
    results: searchResults, 
    loading, 
    error,
    query: searchQuery,
    dateRange,
    tagFilters,
    showAIResults,
    showHidden,
  };
}