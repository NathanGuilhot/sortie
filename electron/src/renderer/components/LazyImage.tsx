import React, { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  photo: any;
  margin?: string | number;
  direction: 'row' | 'column';
  top: number;
  left: number;
  onClick?: (event: React.MouseEvent, photo: any) => void;
}

export default function LazyImage({ photo, margin, direction, top, left, onClick }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Use IntersectionObserver for lazy loading
    if (!imgRef.current) return;

    const options = {
      root: null,
      rootMargin: '200px', // Load when within 200px of viewport
      threshold: 0.1,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Start loading image
          if (imgRef.current && !loaded && !error) {
            imgRef.current.src = photo.src;
          }
          observerRef.current?.unobserve(entry.target);
        }
      });
    }, options);

    observerRef.current.observe(imgRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [photo.src, loaded, error]);

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);

  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    margin,
    top,
    left,
    width: photo.width,
    height: photo.height,
    objectFit: 'cover',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'opacity 0.3s ease',
    opacity: loaded ? 1 : 0,
    cursor: onClick ? 'pointer' : 'default',
  };

  const placeholderStyle: React.CSSProperties = {
    ...imageStyle,
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    color: '#9ca3af',
  };

  return (
    <>
      {!loaded && !error && (
        <div style={placeholderStyle}>
          Loading...
        </div>
      )}
      <img
        ref={imgRef}
        alt={photo.alt || photo.title || ''}
        title={photo.title}
        style={imageStyle}
        onLoad={handleLoad}
        onError={handleError}
        onClick={(e) => onClick && onClick(e, photo)}
        loading="lazy" // native lazy loading as fallback
        crossOrigin="anonymous" // may help with CORS
      />
    </>
  );
}