import type { BoardExportFailure, BoardExportProgress } from 'shared';

interface BoardExportModalProps {
  boardName: string;
  progress: BoardExportProgress | null;
  cancelling: boolean;
  failures: BoardExportFailure[] | null;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function BoardExportModal({
  boardName,
  progress,
  cancelling,
  failures,
  onCancel,
  onRetry,
  onClose,
}: BoardExportModalProps) {
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-export-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="board-export-title" className="text-lg font-semibold text-ink">
          {failures ? 'Export could not be completed' : `Exporting ${boardName}`}
        </h2>

        {failures ? (
          <>
            <p className="mt-2 text-sm text-gray-600">
              No ZIP was created. Fix these files, then retry the export.
            </p>
            <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm">
              {failures.map((failure, index) => (
                <li key={`${failure.fileName}-${index}`}>
                  <div className="font-medium text-red-800 break-all">{failure.fileName}</div>
                  <div className="text-xs text-red-600">{failure.reason}</div>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                onClick={onRetry}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
              >
                Retry
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex justify-between text-sm text-gray-600">
              <span>
                {cancelling ? 'Cancelling…' : progress ? progress.currentFile : 'Preparing…'}
              </span>
              {total > 0 && (
                <span className="ml-3 shrink-0">
                  {current} / {total}
                </span>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-200"
                style={{ width: total > 0 ? `${percent}%` : '8%' }}
              />
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={onCancel}
                disabled={cancelling}
                className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
