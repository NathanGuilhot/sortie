import React, { useEffect } from 'react';
import Gallery from 'react-photo-gallery';
import { useImageStore } from '../stores/imageStore';
import LazyImage from './LazyImage';

interface MasonryGridProps {
  columns?: number;
  margin?: number;
}

export function MasonryGrid({ columns = 3, margin = 8 }: MasonryGridProps) {
  const { images, loading, error, fetchImages } = useImageStore();

  useEffect(() => {
    fetchImages();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading images...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error loading images: {error}</div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No images found. Add a folder to get started.</div>
      </div>
    );
  }

  // Convert images to format expected by react-photo-gallery
  const photos = images.map((img) => ({
    src: `sortie-file://${img.file_path}`,
    width: img.width || 800,
    height: img.height || 600,
    key: img.id.toString(),
    alt: img.file_name,
    title: img.description || img.file_name,
    // Add any other metadata you want to pass
  }));

  return (
    <div className="p-4">
      <Gallery 
        photos={photos} 
        direction="column" 
        columns={columns} 
        margin={margin}
        onClick={(event, { photo, index }) => {
          // Handle image click - maybe open metadata editor
          console.log('Image clicked:', photo, index);
        }}
        renderImage={({ key: imageKey, ...rest }: any) => (
          <LazyImage key={imageKey} {...rest} />
        )}
      />
    </div>
  );
}