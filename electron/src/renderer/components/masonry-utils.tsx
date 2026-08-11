import { useState, memo } from 'react';
import { Image } from 'shared';
import { type Position } from './masonry-layout';
import { isGif } from './gif-utils';
import { GifBadge } from './gif';
import { HeartIcon } from './icons';
import { buildSortieFileUrl, buildSortieThumbUrl } from './sortieImageUrl';
import { useImageDragOut } from './useImageDragOut';
import { useImageStore } from '../stores/imageStore';

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
  const thumbnailRevision = useImageStore((state) => state.thumbnailRevision);
  const { dragProps, consumeDidDrag } = useImageDragOut(image);

  const thumbWidth = Math.ceil((columnWidth * (window.devicePixelRatio || 1)) / 100) * 100;
  const gif = isGif(image);
  // GIFs lose their animation when resized through the sharp-backed thumb
  // pipeline, so stream the original file. Static images still go through the
  // thumb cache.
  const src = gif
    ? buildSortieFileUrl(image.file_path)
    : buildSortieThumbUrl(
        image.file_path,
        thumbWidth,
        `${image.file_mtime_ms ?? ''}-${thumbnailRevision}`,
      );

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
      {...dragProps}
      onClick={() => {
        if (consumeDidDrag()) return;
        onSelect(image);
      }}
    >
      <img
        src={src}
        alt={image.file_name}
        title={image.description || image.file_name}
        // The tile owns the drag; without this the <img> starts its own with a
        // sortie-thumb:// URL nothing outside the app can resolve.
        draggable={false}
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
    </div>
  );
});
