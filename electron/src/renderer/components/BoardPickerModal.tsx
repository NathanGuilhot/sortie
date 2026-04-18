import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import { Board } from 'shared';
import { useBoardStore } from '../stores/boardStore';
import { BoardCover } from './BoardCover';

interface BoardPickerModalProps {
  currentBoardIds: Set<number>;
  onAdd: (board: Board) => void;
  onRemove: (board: Board) => void;
  onClose: () => void;
}

export function BoardPickerModal({
  currentBoardIds,
  onAdd,
  onRemove,
  onClose,
}: BoardPickerModalProps) {
  const { boards, fetchBoards, createBoard } = useBoardStore();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchBoards();
    inputRef.current?.focus();
  }, [fetchBoards]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const fuse = useMemo(
    () =>
      new Fuse(boards, {
        keys: ['name'],
        threshold: 0.4,
        distance: 100,
        minMatchCharLength: 1,
      }),
    [boards],
  );

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return boards;
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, boards, fuse]);

  const trimmed = query.trim();
  const exactMatch = trimmed
    ? boards.find((b) => b.name.toLowerCase() === trimmed.toLowerCase())
    : null;
  const canCreate = !!trimmed && !exactMatch;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const board = await createBoard(trimmed);
      onAdd(board);
      setQuery('');
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canCreate) {
      e.preventDefault();
      void handleCreate();
    }
  };

  const handleCardClick = (board: Board) => {
    if (currentBoardIds.has(board.id)) {
      onRemove(board);
    } else {
      onAdd(board);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Add to board</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or create a board…"
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-gray-300"
          />
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {filtered.length === 0 && !canCreate && (
            <div className="py-12 text-center text-sm text-gray-400">
              {boards.length === 0
                ? 'No boards yet — type a name to create one.'
                : 'No matching boards.'}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((board) => (
                <BoardPickerCard
                  key={board.id}
                  board={board}
                  selected={currentBoardIds.has(board.id)}
                  onClick={() => handleCardClick(board)}
                />
              ))}
            </div>
          )}
        </div>

        {canCreate && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg bg-ink text-white hover:bg-ink/90 disabled:opacity-60"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create board "{trimmed}"
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface BoardPickerCardProps {
  board: Board;
  selected: boolean;
  onClick: () => void;
}

function BoardPickerCard({ board, selected, onClick }: BoardPickerCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block w-full aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 text-left focus:outline-none transition-shadow ${
        selected
          ? 'ring-2 ring-ink ring-offset-2'
          : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-2'
      }`}
    >
      <BoardCover board={board} thumbWidth={300} />

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: board.color }}
          />
          <span className="text-sm font-medium text-white truncate">{board.name}</span>
        </div>
        <div className="text-[11px] text-white/70 tabular-nums mt-0.5">
          {board.image_count} {board.image_count === 1 ? 'image' : 'images'}
        </div>
      </div>

      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center shadow-lg">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}
