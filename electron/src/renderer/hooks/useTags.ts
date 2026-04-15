import { useTagStore } from '../stores/tagStore';
import { useEffect } from 'react';

export function useTags() {
  const { tags, loading, error, fetchTags } = useTagStore();

  useEffect(() => {
    fetchTags();
  }, []);

  return { tags, loading, error, refresh: fetchTags };
}