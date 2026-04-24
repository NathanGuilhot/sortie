import { BulkImportButton } from '../components/BulkImportButton';
import type { PinterestTarget } from 'shared';

interface ImportBoardSummaryProps {
  boardPinCount: number | null;
  hiddenAiCount: number;
  target: PinterestTarget | null;
  targetLabel: string;
  visibleResultsCount: number;
}

export function ImportBoardSummary({
  boardPinCount,
  hiddenAiCount,
  target,
  targetLabel,
  visibleResultsCount,
}: ImportBoardSummaryProps) {
  if (target?.kind === 'board') {
    return (
      <div className="max-w-3xl mx-auto mb-4 px-4 py-3 rounded-2xl bg-white border border-gray-200/70 shadow-sm flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink truncate">
            {target.username}
            <span className="text-gray-300"> / </span>
            <span className="text-gray-700">{target.slug}</span>
          </div>
          <div className="text-[11px] text-gray-500 tabular-nums">
            {boardPinCount != null
              ? `${boardPinCount} pin${boardPinCount !== 1 ? 's' : ''}`
              : `${visibleResultsCount} loaded`}
            {hiddenAiCount > 0 && (
              <span className="text-gray-400"> · {hiddenAiCount} AI-generated hidden</span>
            )}
          </div>
        </div>
        <BulkImportButton />
      </div>
    );
  }

  if (!targetLabel) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto mb-3 text-xs text-gray-400 text-center">
      {visibleResultsCount} result{visibleResultsCount !== 1 ? 's' : ''} for {targetLabel}
      {hiddenAiCount > 0 && (
        <span className="text-gray-300"> · {hiddenAiCount} AI-generated hidden</span>
      )}
    </div>
  );
}
