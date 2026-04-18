import { useMemo, useState } from 'react';
import { Board, Tag } from 'shared';
import { BoardPickerModal } from './BoardPickerModal';
import { useImageStore } from '../stores/imageStore';
import { useBoardStore } from '../stores/boardStore';

interface AddToBoardButtonProps {
  imageId: number;
  imageTags: Tag[];
}

export function AddToBoardButton({ imageId, imageTags }: AddToBoardButtonProps) {
  const [open, setOpen] = useState(false);
  const addToBoard = useImageStore((s) => s.addToBoard);
  const removeFromBoard = useImageStore((s) => s.removeFromBoard);
  const boards = useBoardStore((s) => s.boards);

  const currentBoards = useMemo(() => {
    const boardTagIds = new Set(
      imageTags
        .filter((t) => t.category === 'user' || t.category === 'ai')
        .map((t) => t.id),
    );
    return boards.filter((b) => boardTagIds.has(b.id));
  }, [imageTags, boards]);

  const currentBoardIds = useMemo(
    () => new Set(currentBoards.map((b) => b.id)),
    [currentBoards],
  );

  const handleAdd = async (board: Board) => {
    await addToBoard(imageId, board.id);
  };

  const handleRemove = async (board: Board) => {
    await removeFromBoard(imageId, board.id);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {currentBoards.map((board) => (
          <span
            key={board.id}
            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: board.color }}
            />
            {board.name}
            <button
              onClick={() => void handleRemove(board)}
              className="w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
              aria-label={`Remove from ${board.name}`}
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add to board
        </button>
      </div>

      {open && (
        <BoardPickerModal
          currentBoardIds={currentBoardIds}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
