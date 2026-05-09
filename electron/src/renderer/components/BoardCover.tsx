import { Board } from 'shared';
import { buildSortieThumbUrl } from './sortieImageUrl';

interface BoardCoverProps {
  board: Board;
  thumbWidth?: number;
}

export function BoardCover({ board, thumbWidth = 400 }: BoardCoverProps) {
  const previews = board.preview_image_paths ?? [];

  if (previews.length === 0) {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center text-white text-4xl font-semibold"
        style={{ backgroundColor: board.color }}
      >
        {board.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-white">
      {Array.from({ length: 4 }).map((_, i) => {
        const path = previews[i];
        if (path) {
          return (
            <img
              key={i}
              src={buildSortieThumbUrl(path, thumbWidth)}
              alt=""
              className="w-full h-full object-cover"
            />
          );
        }
        return (
          <div
            key={i}
            className="w-full h-full"
            style={{ backgroundColor: board.color, opacity: 0.7 }}
          />
        );
      })}
    </div>
  );
}
