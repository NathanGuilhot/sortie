import { useState, memo } from 'react';
import { Image } from 'shared';
import { type Position } from './masonry-layout';
import { isGif, GifBadge } from './gif';

export const MasonryImage = memo(function MasonryImage({
  image,
  position,
  columnWidth,
  onClick,
}: {
  image: Image;
  position: Position;
  columnWidth: number;
  onClick: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  const thumbWidth = Math.ceil((columnWidth * (window.devicePixelRatio || 1)) / 100) * 100;
  const gif = isGif(image);
  // GIFs lose their animation when resized through the sharp-backed thumb
  // pipeline, so stream the original file. Static images still go through the
  // thumb cache.
  const src = gif
    ? `sortie-file://${image.file_path}`
    : `sortie-thumb://${image.file_path}?w=${thumbWidth}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: position.y,
        left: position.x,
        width: position.width,
        height: position.height,
        borderRadius: 4,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        backgroundColor: '#f3f4f6',
      }}
      onClick={onClick}
    >
      <img
        src={src}
        alt={image.file_name}
        title={image.description || image.file_name}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        onLoad={() => setLoaded(true)}
      />
      {gif && loaded && <GifBadge corner="bottom-right" />}
      {image.favorite && loaded && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: 'rgba(244, 63, 94, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
          title="Favorite"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>
      )}
      {image.embedded === false && loaded && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
          title="No embedding — won't appear in search results"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      )}
    </div>
  );
});
