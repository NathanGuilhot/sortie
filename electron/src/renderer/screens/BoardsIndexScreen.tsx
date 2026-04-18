import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Board } from 'shared';
import { useBoardStore } from '../stores/boardStore';
import { BoardCover } from '../components/BoardCover';

export function BoardsIndexScreen() {
  const navigate = useNavigate();
  const { boards, loading, fetchBoards, createBoard, renameBoard, deleteBoard } = useBoardStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menuOpenId]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createBoard(trimmed);
    setNewName('');
    setCreating(false);
  };

  const handleRename = async (id: number) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await renameBoard(id, trimmed);
    setRenamingId(null);
  };

  const handleDelete = async (board: Board) => {
    if (!window.confirm(`Delete board "${board.name}"? Images stay, only the board is removed.`)) return;
    await deleteBoard(board.id);
  };

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto px-6 pt-6 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Boards</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {boards.length} {boards.length === 1 ? 'board' : 'boards'}
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-ink text-white hover:bg-ink/90"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New board
          </button>
        </div>

        {creating && (
          <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
              placeholder="Board name"
              className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-300"
            />
            <button
              onClick={() => void handleCreate()}
              disabled={!newName.trim()}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-ink text-white hover:bg-ink/90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}

        {!loading && boards.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 mb-1">No boards yet</p>
            <p className="text-xs text-gray-400">Create boards to curate your photos, Pinterest-style.</p>
          </div>
        )}

        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {boards.map((board) => (
            <BoardTile
              key={board.id}
              board={board}
              onOpen={() => {
                void navigate(`/boards/${board.id}`);
              }}
              menuOpen={menuOpenId === board.id}
              onMenuToggle={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === board.id ? null : board.id);
              }}
              renaming={renamingId === board.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameStart={() => {
                setRenamingId(board.id);
                setRenameValue(board.name);
                setMenuOpenId(null);
              }}
              onRenameSubmit={() => void handleRename(board.id)}
              onRenameCancel={() => setRenamingId(null)}
              onDelete={() => void handleDelete(board)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

interface BoardTileProps {
  board: Board;
  onOpen: () => void;
  menuOpen: boolean;
  onMenuToggle: (e: React.MouseEvent) => void;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
}

function BoardTile({
  board,
  onOpen,
  menuOpen,
  onMenuToggle,
  renaming,
  renameValue,
  onRenameChange,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: BoardTileProps) {
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="block w-full aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 relative focus:outline-none focus:ring-2 focus:ring-ink/40"
      >
        <BoardCover board={board} thumbWidth={600} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit();
                if (e.key === 'Escape') onRenameCancel();
              }}
              className="w-full px-2 py-0.5 text-sm font-medium bg-white border border-gray-300 rounded outline-none"
            />
          ) : (
            <div className="text-sm font-medium text-ink truncate">{board.name}</div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">
            {board.image_count} {board.image_count === 1 ? 'image' : 'images'}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={onMenuToggle}
            className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label="Board menu"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-10 bg-white rounded-lg shadow-xl border border-gray-200/60 py-1 w-32"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={onRenameStart}
                className="w-full px-3 py-1.5 text-sm text-left text-gray-700 hover:bg-gray-50"
              >
                Rename
              </button>
              <button
                onClick={onDelete}
                className="w-full px-3 py-1.5 text-sm text-left text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
