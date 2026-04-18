import { useCallback, useEffect, useState } from 'react';
import { Image } from 'shared';
import { useImageStore } from '../stores/imageStore';

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
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        Suggested to add
      </label>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {loading && visible.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                className="flex-shrink-0 rounded-md bg-gray-100 animate-pulse"
              />
            ))
          : visible.map((image) => (
              <div
                key={image.id}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                className="group relative flex-shrink-0 rounded-md overflow-hidden bg-gray-100 cursor-pointer"
                onClick={() => void handleAdd(image)}
                title={`Add ${image.file_name} to board`}
              >
                <img
                  src={`sortie-thumb://${image.file_path}?w=${THUMB_FETCH_WIDTH}`}
                  alt={image.file_name}
                  draggable={false}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDismiss(image.id);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                  title="Dismiss suggestion"
                  aria-label="Dismiss suggestion"
                >
                  <svg
                    className="w-2.5 h-2.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
      </div>
    </div>
  );
}
