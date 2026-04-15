import { useImageStore } from '../stores/imageStore';
import { useEffect } from 'react';

export function useImages() {
  const { images, loading, error, fetchImages } = useImageStore();

  useEffect(() => {
    fetchImages();
  }, []);

  return { images, loading, error, refresh: fetchImages };
}