import { useEffect, useMemo, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useNavigate, useParams } from 'react-router-dom';
import { Board, Image } from 'shared';
import { useImageStore } from '../stores/imageStore';
import { useBoardStore } from '../stores/boardStore';
import { type Position } from '../components/masonry-layout';
import { useMasonryLayout } from '../components/useMasonryLayout';
import { MetadataModal } from '../components/MetadataModal';
import { BoardSuggestionsRow } from '../components/BoardSuggestionsRow';
import { isGif } from '../components/gif-utils';
import { GifBadge } from '../components/gif';
import { ChevronLeftIcon, GripIcon, XIcon } from '../components/icons';
import { buildSortieFileUrl, buildSortieThumbUrl } from '../components/sortieImageUrl';
import { useImageDragOut } from '../components/useImageDragOut';

const DND_TYPE = 'board-image';

export function BoardDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const tagId = Number(id);
  const navigate = useNavigate();

  const images = useImageStore((s) => s.images);
  const setImages = useImageStore((s) => s.setImages);
  const fetchBoardImages = useImageStore((s) => s.fetchBoardImages);
  const reorderBoardImages = useImageStore((s) => s.reorderBoardImages);
  const removeFromBoard = useImageStore((s) => s.removeFromBoard);
  const selectedImage = useImageStore((s) => s.selectedImage);
  const viewerBackStack = useImageStore((s) => s.viewerBackStack);
  const viewerForwardStack = useImageStore((s) => s.viewerForwardStack);
  const openImageViewer = useImageStore((s) => s.openImageViewer);
  const closeImageViewer = useImageStore((s) => s.closeImageViewer);
  const navigateImageViewer = useImageStore((s) => s.navigateImageViewer);
  const goBackImageViewer = useImageStore((s) => s.goBackImageViewer);
  const goForwardImageViewer = useImageStore((s) => s.goForwardImageViewer);

  const boards = useBoardStore((s) => s.boards);
  const fetchBoards = useBoardStore((s) => s.fetchBoards);
  const renameBoard = useBoardStore((s) => s.renameBoard);

  const board: Board | undefined = useMemo(
    () => boards.find((b) => b.id === tagId),
    [boards, tagId],
  );

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    if (!Number.isFinite(tagId)) return;
    void fetchBoardImages(tagId);
    if (boards.length === 0) void fetchBoards();
  }, [tagId, fetchBoardImages, fetchBoards, boards.length]);

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...images];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setImages(next);
  };

  const handleDropCommit = () => {
    void reorderBoardImages(
      tagId,
      images.map((img) => img.id),
    );
  };

  const handleRemove = async (imageId: number) => {
    await removeFromBoard(imageId, tagId);
    setImages(images.filter((img) => img.id !== imageId));
  };

  const handleRenameSubmit = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== board?.name) {
      await renameBoard(tagId, trimmed);
    }
    setRenaming(false);
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <DndProvider backend={HTML5Backend}>
      <main className="flex-1 overflow-hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-6 pb-16">
          <div className="flex items-center gap-3 mb-5 px-4">
            <button
              onClick={() => {
                void navigate('/boards');
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-ink hover:bg-gray-100"
              aria-label="Back to boards"
            >
              <ChevronLeftIcon />
            </button>
            <div className="flex-1 min-w-0">
              {renaming ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => void handleRenameSubmit()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRenameSubmit();
                    if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="text-2xl font-semibold text-ink bg-transparent border-b border-gray-300 outline-none"
                />
              ) : (
                <h1
                  className="text-2xl font-semibold text-ink truncate cursor-text"
                  onClick={() => {
                    setNameDraft(board?.name ?? '');
                    setRenaming(true);
                  }}
                  title="Click to rename"
                >
                  {board?.name ?? 'Board'}
                </h1>
              )}
              <p className="text-sm text-gray-500 mt-0.5">
                {images.length} {images.length === 1 ? 'image' : 'images'} · Drag images out or use
                the handle to reorder
              </p>
            </div>
          </div>

          <BoardMasonry
            images={images}
            scrollContainerRef={scrollContainerRef}
            onReorder={handleReorder}
            onDropCommit={handleDropCommit}
            onOpen={(img) => openImageViewer(img)}
            onRemove={(imageId) => void handleRemove(imageId)}
          />

          {images.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <p className="text-sm text-gray-600 mb-1">This board is empty</p>
              <p className="text-xs text-gray-400">
                Add images to this board from the metadata panel in the gallery.
              </p>
            </div>
          )}

          {Number.isFinite(tagId) && images.length > 0 && (
            <div className="px-4">
              <BoardSuggestionsRow
                tagId={tagId}
                excludeIds={images.map((img) => img.id)}
                onAdd={(img) => setImages([...images, img])}
              />
            </div>
          )}
        </div>

        {selectedImage && (
          <MetadataModal
            image={selectedImage}
            onClose={closeImageViewer}
            onNavigate={navigateImageViewer}
            onBack={goBackImageViewer}
            onForward={goForwardImageViewer}
            canGoBack={viewerBackStack.length > 0}
            canGoForward={viewerForwardStack.length > 0}
          />
        )}
      </main>
    </DndProvider>
  );
}

interface BoardMasonryProps {
  images: Image[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onReorder: (from: number, to: number) => void;
  onDropCommit: () => void;
  onOpen: (image: Image) => void;
  onRemove: (imageId: number) => void;
}

function BoardMasonry({
  images,
  scrollContainerRef,
  onReorder,
  onDropCommit,
  onOpen,
  onRemove,
}: BoardMasonryProps) {
  const { containerRef, columnWidth, layout, visibleIndices, padding } = useMasonryLayout({
    items: images,
    scrollContainerRef,
  });

  return (
    <div
      ref={containerRef}
      className="p-4"
      style={{
        position: 'relative',
        minHeight: layout.totalHeight + padding,
      }}
    >
      {visibleIndices.map((i) => (
        <DraggableTile
          key={images[i].id}
          image={images[i]}
          index={i}
          position={layout.positions[i]}
          columnWidth={columnWidth}
          onReorder={onReorder}
          onDropCommit={onDropCommit}
          onOpen={() => onOpen(images[i])}
          onRemove={() => onRemove(images[i].id)}
        />
      ))}
    </div>
  );
}

interface DraggableTileProps {
  image: Image;
  index: number;
  position: Position;
  columnWidth: number;
  onReorder: (from: number, to: number) => void;
  onDropCommit: () => void;
  onOpen: () => void;
  onRemove: () => void;
}

function DraggableTile({
  image,
  index,
  position,
  columnWidth,
  onReorder,
  onDropCommit,
  onOpen,
  onRemove,
}: DraggableTileProps) {
  const { dragProps, consumeDidDrag } = useImageDragOut(image);
  const [{ isDragging }, drag] = useDrag({
    type: DND_TYPE,
    item: { index },
    end: () => onDropCommit(),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: DND_TYPE,
    hover: (item: { index: number }) => {
      if (item.index === index) return;
      onReorder(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  const setDropRef = (node: HTMLDivElement | null) => {
    drop(node);
  };

  const thumbWidth = Math.ceil((columnWidth * (window.devicePixelRatio || 1)) / 100) * 100;
  const gif = isGif(image);
  const src = gif
    ? buildSortieFileUrl(image.file_path)
    : buildSortieThumbUrl(image.file_path, thumbWidth, image.file_mtime_ms);

  return (
    <div
      ref={setDropRef}
      style={{
        position: 'absolute',
        top: position.y,
        left: position.x,
        width: position.width,
        height: position.height,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: isOver ? '0 0 0 2px rgb(17 24 39)' : '0 2px 8px rgba(0,0,0,0.1)',
        backgroundColor: '#f3f4f6',
        opacity: isDragging ? 0.4 : 1,
        transition: 'opacity 0.15s, box-shadow 0.15s',
      }}
      className="group"
    >
      <img
        src={src}
        alt={image.file_name}
        {...dragProps}
        onClick={() => {
          if (consumeDidDrag()) return;
          onOpen();
        }}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {gif && <GifBadge corner="bottom-right" />}
      <button
        ref={drag}
        type="button"
        className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/80 cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripIcon className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
        title="Remove from board"
        aria-label="Remove from board"
      >
        <XIcon className="w-3 h-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}
