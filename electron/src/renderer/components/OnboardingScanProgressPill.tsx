import { XIcon } from './icons';
import type { SortieProgress } from 'shared';

export function OnboardingScanProgressPill({
  progress,
  onCancel,
}: {
  progress: SortieProgress;
  onCancel?: () => void;
}) {
  const pct =
    progress.total > 0 ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100)) : 0;
  const name = progress.currentFile.split('/').pop() ?? '';
  return (
    <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
      <div className="flex items-center gap-3 bg-white rounded-full shadow-xl shadow-black/10 border border-gray-200/60 px-4 py-2 min-w-[280px]">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-lavender border-t-ink shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-ink">
            <span>Checking your folder</span>
            <span className="text-ink/50">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="w-full h-1 bg-lavender/30 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {name && <div className="text-[10px] text-ink/40 truncate mt-0.5">{name}</div>}
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel scan"
            className="shrink-0 rounded-full h-6 w-6 flex items-center justify-center text-ink/40 hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
