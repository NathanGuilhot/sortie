import { useState, memo } from 'react';
import { Image } from 'shared';
import { type Position } from './masonry-layout';
import { isGif } from './gif-utils';
import { GifBadge } from './gif';
import { HeartIcon, XIcon } from './icons';

export const MasonryImage = memo(function MasonryImage({
  image,
  position,
  columnWidth,
  onSelect,
}: {
  image: Image;
  position: Position;
  columnWidth: number;
  onSelect: (image: Image) => void;
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
        top: 0,
        left: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: position.width,
        height: position.height,
        cursor: 'pointer',
        backgroundColor: loaded ? 'transparent' : '#f3f4f6',
        borderRadius: 4,
        willChange: 'transform',
        contentVisibility: 'auto',
        containIntrinsicSize: `${position.height}px ${position.width}px`,
      }}
      onClick={() => onSelect(image)}
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
          borderRadius: 4,
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
        onLoad={() => setLoaded(true)}
      />
      {gif && loaded && <GifBadge corner="bottom-right" />}
      {!!image.favorite && loaded && (
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
          <HeartIcon className="w-[11px] h-[11px] text-white" filled />
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
          <XIcon className="w-3 h-3 text-white" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
});
