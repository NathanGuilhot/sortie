import { useCallback, useEffect, useState } from 'react';
import { Image } from 'shared';
import { useImageStore } from '../stores/imageStore';
import { isGif } from './gif-utils';
import { GifBadge } from './gif';
import { BulbIcon, XIcon } from './icons';
import { buildSortieFileUrl, buildSortieThumbUrl } from './sortieImageUrl';

const THUMB_SIZE = 96;
const THUMB_FETCH_WIDTH = 200;

interface BoardSuggestionsRowProps {
  tagId: number;
  excludeIds: number[];
  onAdd: (image: Image) => void;
}

export function BoardSuggestionsRow({ tagId, excludeIds, onAdd }: BoardSuggestionsRowProps) {
  const addToBoard = useImageStore((s) => s.addToBoard);
  const [suggestions, setSuggestions] = useState<Image[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const results = await window.sortieAPI.boards.getImageSuggestions(tagId);
      setSuggestions(results);
    } finally {
      setLoading(false);
    }
  }, [tagId]);

  useEffect(() => {
    if (!Number.isFinite(tagId)) return;
    void fetchSuggestions();
  }, [tagId, fetchSuggestions]);

  const visible = suggestions.filter((img) => !excludeIds.includes(img.id));

  const handleAdd = async (image: Image) => {
    setSuggestions((prev) => prev.filter((img) => img.id !== image.id));
    await addToBoard(image.id, tagId);
    onAdd(image);
  };

  const handleDismiss = async (imageId: number) => {
    setSuggestions((prev) => prev.filter((img) => img.id !== imageId));
    await window.sortieAPI.dismissSuggestion(imageId, tagId);
  };

  if (!loading && visible.length === 0) return null;

  return (
    <div className="mt-8 border-t border-gray-200 pt-5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2.5">
        <BulbIcon className="w-3.5 h-3.5" />
        Suggested to add
      </label>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-2">
          {loading && visible.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                  className="flex-shrink-0 rounded-md bg-gray-100 animate-pulse"
                />
              ))
            : visible.map((image) => {
                const gif = isGif(image);
                const src = gif
                  ? buildSortieFileUrl(image.file_path)
                  : buildSortieThumbUrl(image.file_path, THUMB_FETCH_WIDTH, image.file_mtime_ms);
                return (
                  <div
                    key={image.id}
                    style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                    className="group relative flex-shrink-0 rounded-md overflow-hidden bg-gray-100 cursor-pointer"
                    onClick={() => void handleAdd(image)}
                    title={`Add ${image.file_name} to board`}
                  >
                    <img
                      src={src}
                      alt={image.file_name}
                      draggable={false}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    {gif && <GifBadge corner="bottom-right" />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDismiss(image.id);
                      }}
                      className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                      title="Dismiss suggestion"
                      aria-label="Dismiss suggestion"
                    >
                      <XIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
