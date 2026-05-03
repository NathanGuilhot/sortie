import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Image, PinterestResult, PinterestTarget } from 'shared';
import { MetadataModal } from '../components/MetadataModal';
import { EmptyState, PrimaryButton } from '../components/screen';
import { AlertIcon, BookIcon } from '../components/icons';
import { PinterestResultCard } from '../components/PinterestResultCard';
import type { LayoutResult } from '../components/masonry-layout';
import { ImportBoardSummary } from './ImportBoardSummary';
import { useImageStore } from '../stores/imageStore';
import type { PinterestImportError } from '../stores/pinterestImportStore';

const bookIconNode = <BookIcon />;
const alertIconNode = <AlertIcon />;

function errorCopy(error: PinterestImportError): { title: string; description: string } {
  switch (error.code) {
    case 'network':
      return {
        title: 'You appear to be offline.',
        description: 'Reconnect to the internet and try again.',
      };
    case 'bootstrap':
    case 'blocked':
      return {
        title: "Couldn't reach Pinterest.",
        description:
          "If you're using a VPN, try disabling it — Pinterest blocks some VPN exit nodes and silently returns no results.",
      };
    case 'rate_limited':
      return {
        title: 'Pinterest is rate-limiting us.',
        description: 'Wait a few seconds and try again.',
      };
    case 'parse':
      return {
        title: 'Pinterest sent an unexpected response.',
        description: 'Their API may have changed. Try again, and report this if it persists.',
      };
    case 'invalid_input':
    case 'not_found':
      return { title: "That input didn't work.", description: error.message };
    case 'unknown':
    default:
      return {
        title: 'Something went wrong fetching from Pinterest.',
        description: error.message,
      };
  }
}

interface ImportResultsGridProps {
  boardPinCount: number | null;
  columns: number;
  error: PinterestImportError | null;
  gridRef: RefObject<HTMLDivElement>;
  hiddenAiCount: number;
  isEnd: boolean;
  layout: LayoutResult;
  loading: boolean;
  loadingMore: boolean;
  previewImage: Image | null;
  results: PinterestResult[];
  setPreviewImage: (image: Image | null) => void;
  showAllHidden: boolean;
  showEmpty: boolean;
  showError: boolean;
  showWelcome: boolean;
  target: PinterestTarget | null;
  targetLabel: string;
  visibleResults: PinterestResult[];
  onPreview: (imageId: number) => void;
  onRetry: () => void;
}

export function ImportResultsGrid({
  boardPinCount,
  columns,
  error,
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
  showError,
  showWelcome,
  target,
  targetLabel,
  visibleResults,
  onPreview,
  onRetry,
}: ImportResultsGridProps) {
  const navigate = useNavigate();
  const setGallerySelectedImage = useImageStore((state) => state.setSelectedImage);
  const errorInfo = showError && error ? errorCopy(error) : null;
  const handleSimilarImageClick = (image: Image) => {
    setPreviewImage(null);
    setGallerySelectedImage(image);
    void navigate('/gallery');
  };

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

        {errorInfo && (
          <EmptyState
            icon={alertIconNode}
            title={errorInfo.title}
            description={errorInfo.description}
            action={<PrimaryButton onClick={onRetry}>Try again</PrimaryButton>}
          />
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
            {loadingMore && (
              <div className="mt-4 text-center text-xs text-gray-400">Loading more…</div>
            )}
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
          onSimilarImageClick={handleSimilarImageClick}
        />
      )}
    </>
  );
}
