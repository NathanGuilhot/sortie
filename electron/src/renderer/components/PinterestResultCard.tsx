import { useState, memo } from 'react';
import type { PinterestResult } from 'shared';
import { usePinterestStore } from '../stores/pinterestStore';
import type { Position } from './masonry-layout';
import { isGifUrl } from './gif-utils';
import { GifBadge } from './gif';

interface PinterestResultCardProps {
  pin: PinterestResult;
  position: Position;
}

export const PinterestResultCard = memo(function PinterestResultCard({
  pin,
  position,
}: PinterestResultCardProps) {
  const importState = usePinterestStore((s) => s.imports[pin.pinId]);
  const importPin = usePinterestStore((s) => s.importPin);
  const hideAiGenerated = usePinterestStore((s) => s.hideAiGenerated);
  const [loaded, setLoaded] = useState(false);

  const status = importState?.status ?? 'idle';
  const isPending = status === 'pending';
  const isImported = status === 'imported';
  const isError = status === 'error';
  const gif = isGifUrl(pin.imageUrl);

  const handleClick = () => {
    if (isPending || isImported) return;
    void importPin(pin);
  };

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pin.sourceUrl) void window.sortieAPI.app.openExternal(pin.sourceUrl);
  };

  return (
    <div
      className="absolute group cursor-pointer"
      style={{
        top: position.y,
        left: position.x,
        width: position.width,
        height: position.height,
      }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={
        isImported
          ? 'Imported to your library'
          : isPending
            ? 'Importing…'
            : 'Click to add to library'
      }
    >
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-gray-100 shadow-sm transition-shadow group-hover:shadow-md">
        <img
          src={pin.imageUrl}
          alt={pin.alt ?? ''}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="block w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.2s ease' }}
          onLoad={() => setLoaded(true)}
          draggable={false}
        />

        {/* Hover overlay: domain + import hint */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 pointer-events-none ${
            isImported
              ? 'bg-black/0'
              : 'bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100'
          }`}
        />

        {/* AI-generated badge — top-left. Only visible when the user has
            opted in to seeing AI results, so they can tell them apart. */}
        {pin.isAiGenerated && !hideAiGenerated && !isImported && (
          <div className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-white bg-black/55 backdrop-blur rounded-full">
            AI
          </div>
        )}

        {gif && !isImported && <GifBadge corner="bottom-right" />}

        {/* Domain chip — bottom-left */}
        {pin.sourceDomain && pin.sourceUrl && !isImported && (
          <button
            onClick={handleSourceClick}
            className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] px-2 py-1 text-[11px] font-medium text-white bg-black/50 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          >
            <span className="truncate inline-block max-w-[160px] align-middle">
              {pin.sourceDomain}
            </span>
          </button>
        )}

        {/* Status badge — top-right */}
        {(isImported || isPending || isError) && (
          <div
            className={`absolute top-2 right-2 px-2 py-1 text-[11px] font-medium rounded-full backdrop-blur ${
              isImported
                ? 'bg-mint/90 text-ink'
                : isPending
                  ? 'bg-white/90 text-ink'
                  : 'bg-red-500/90 text-white'
            }`}
          >
            {isImported ? (
              <span className="flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Imported
              </span>
            ) : isPending ? (
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                Importing
              </span>
            ) : (
              'Failed'
            )}
          </div>
        )}
      </div>
      {isError && importState?.error && (
        <div
          className="absolute -bottom-5 left-0 right-0 px-2 text-[11px] text-red-500 truncate"
          title={importState.error}
        >
          {importState.error}
        </div>
      )}
    </div>
  );
});
