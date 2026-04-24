import type { RefObject } from 'react';
import type { Image, PinterestResult, PinterestTarget } from 'shared';
import { MetadataModal } from '../components/MetadataModal';
import { EmptyState } from '../components/screen';
import { BookIcon } from '../components/icons';
import { PinterestResultCard } from '../components/PinterestResultCard';
import type { LayoutResult } from '../components/masonry-layout';
import { ImportBoardSummary } from './ImportBoardSummary';

const bookIconNode = <BookIcon />;

interface ImportResultsGridProps {
  boardPinCount: number | null;
  columns: number;
  gridRef: RefObject<HTMLDivElement>;
  hiddenAiCount: number;
  isEnd: boolean;
  layout: LayoutResult;
  loading: boolean;
  loadingMore: boolean;
  previewImage: Image | null;
  results: PinterestResult[];
  setPreviewImage(image: Image | null): void;
  showAllHidden: boolean;
  showEmpty: boolean;
  showWelcome: boolean;
  target: PinterestTarget | null;
  targetLabel: string;
  visibleResults: PinterestResult[];
  onPreview(imageId: number): void;
}

export function ImportResultsGrid({
  boardPinCount,
  columns,
  gridRef,
  hiddenAiCount,
  isEnd,
  layout,
  loading,
  loadingMore,
  previewImage,
  results,
  setPreviewImage,
  showAllHidden,
  showEmpty,
  showWelcome,
  target,
  targetLabel,
  visibleResults,
  onPreview,
}: ImportResultsGridProps) {
  return (
    <>
      <div ref={gridRef} className="w-full">
        {loading && results.length === 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                key={index}
                className="rounded-lg bg-gray-200 animate-pulse"
                style={{
                  height: [220, 300, 260, 200, 320, 240, 280, 210, 290, 250, 230, 270][index],
                }}
              />
            ))}
          </div>
        )}

        {showWelcome && (
          <EmptyState
            icon={bookIconNode}
            title="Add more from the web"
            description={
              <>
                Search Pinterest by keyword, or paste a board URL like{' '}
                <code className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                  pinterest.com/&lt;user&gt;/&lt;board&gt;/
                </code>
              </>
            }
          />
        )}

        {showEmpty && (
          <EmptyState
            icon={bookIconNode}
            title="No results"
            description={`Nothing matched ${targetLabel}. Try a different keyword or URL.`}
          />
        )}

        {showAllHidden && (
          <EmptyState
            icon={bookIconNode}
            title="All results hidden"
            description={
              <>
                All {results.length} pin{results.length !== 1 ? 's' : ''} for {targetLabel} are
                AI-generated. Uncheck <em>Hide AI-generated</em> above to show them.
              </>
            }
          />
        )}

        {results.length > 0 && !showAllHidden && (
          <>
            <ImportBoardSummary
              boardPinCount={boardPinCount}
              hiddenAiCount={hiddenAiCount}
              target={target}
              targetLabel={targetLabel}
              visibleResultsCount={visibleResults.length}
            />
            <div className="relative" style={{ height: layout.totalHeight }}>
              {visibleResults.map((pin, index) => {
                const position = layout.positions[index];
                if (!position) return null;

                return (
                  <PinterestResultCard
                    key={pin.pinId}
                    pin={pin}
                    position={position}
                    onPreview={onPreview}
                  />
                );
              })}
            </div>
            {loadingMore && <div className="mt-4 text-center text-xs text-gray-400">Loading more…</div>}
            {isEnd && visibleResults.length > 0 && (
              <div className="mt-4 text-center text-xs text-gray-300">— end of results —</div>
            )}
          </>
        )}
      </div>

      {previewImage && (
        <MetadataModal
          image={previewImage}
          images={[previewImage]}
          onClose={() => setPreviewImage(null)}
          onNavigate={setPreviewImage}
        />
      )}
    </>
  );
}
