import { usePinterestImportStore } from '../stores/pinterestImportStore';
import { usePinterestStore } from '../stores/pinterestStore';

const CONFIRM_THRESHOLD = 100;

export function BulkImportButton() {
  const hideAiGenerated = usePinterestStore((state) => state.hideAiGenerated);
  const target = usePinterestImportStore((state) => state.target);
  const boardPinCount = usePinterestImportStore((state) => state.boardPinCount);
  const bulk = usePinterestImportStore((state) => state.bulkImport);
  const startBulkImport = usePinterestImportStore((state) => state.startBulkImport);
  const cancelBulkImport = usePinterestImportStore((state) => state.cancelBulkImport);

  if (!target || target.kind !== 'board') return null;
  if (!boardPinCount || boardPinCount <= 0) return null;

  const isRunning = bulk.status === 'running' || bulk.status === 'starting';
  const isCancelling = bulk.status === 'cancelling';
  const isDone = bulk.status === 'done';
  const isCancelled = bulk.status === 'cancelled';
  const isError = bulk.status === 'error';

  const handleStart = () => {
    if (boardPinCount > CONFIRM_THRESHOLD) {
      const ok = window.confirm(
        `Import all ${boardPinCount} pins from this board?\n\nThis will download each image and may take a few minutes.`,
      );
      if (!ok) return;
    }
    void startBulkImport(hideAiGenerated);
  };

  if (isRunning || isCancelling) {
    const done = bulk.imported + bulk.skipped + bulk.failed;
    const pct = bulk.total > 0 ? Math.min(100, Math.round((done / bulk.total) * 100)) : 0;
    return (
      <div className="flex items-center gap-3 min-w-[240px]">
        <div className="flex-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-gray-500 tabular-nums">
            {done} / {bulk.total}
            {bulk.skipped > 0 && <span className="text-gray-400"> · {bulk.skipped} skipped</span>}
            {bulk.failed > 0 && <span className="text-red-500"> · {bulk.failed} failed</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void cancelBulkImport()}
          disabled={isCancelling}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCancelling ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    );
  }

  if (isDone || isCancelled) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-mint/30 text-ink font-medium">
          {isCancelled ? 'Stopped' : 'Done'} · {bulk.imported} added
          {bulk.skipped > 0 && `, ${bulk.skipped} skipped`}
          {bulk.failed > 0 && `, ${bulk.failed} failed`}
        </span>
        <button
          type="button"
          onClick={handleStart}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {isError && bulk.error && (
        <span className="text-[11px] text-red-500 max-w-[220px] truncate" title={bulk.error}>
          {bulk.error}
        </span>
      )}
      <button
        type="button"
        onClick={handleStart}
        className="px-4 py-1.5 text-xs font-semibold rounded-full bg-ink text-white hover:bg-ink/90 transition-colors"
      >
        Import all {boardPinCount} pin{boardPinCount !== 1 ? 's' : ''}
      </button>
    </div>
  );
}
