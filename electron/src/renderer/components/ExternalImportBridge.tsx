import { useCallback, useEffect, useState } from 'react';
import type {
  Board,
  ExternalBoardImportRequest,
  ExternalImportAction,
  ExternalImportComplete,
  ExternalImportProgress,
} from 'shared';
import { BoardPickerModal } from './BoardPickerModal';
import { toast } from '../stores/toastStore';
import { showIpcError } from '../ipc';
import { useBoardStore } from '../stores/boardStore';
import { useFolderStore } from '../stores/folderStore';
import { useImageStore } from '../stores/imageStore';

const PROGRESS_LABELS: Record<ExternalImportAction, string> = {
  'add-images-to-gallery': 'Adding to gallery',
  'add-folders-to-gallery': 'Adding folder to gallery',
  'add-to-board': 'Preparing board import',
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function showCompleteToast(complete: ExternalImportComplete): void {
  if (complete.action === 'add-to-board') {
    if (complete.imported === 0 && complete.skipped === 0 && complete.failed === 0) {
      toast.info('No supported images found.');
      return;
    }
    if (complete.imported === 0 && complete.failed > 0) {
      toast.info(`Could not prepare board import. ${complete.failed} failed.`);
      return;
    }
    if (complete.failed > 0) {
      toast.info(
        `Added ${pluralize(complete.imported, 'image')} to board. ${complete.failed} failed.`,
      );
      return;
    }
    toast.success(`Added ${pluralize(complete.imported, 'image')} to board.`);
    return;
  }

  if (complete.imported === 0 && complete.skipped === 0 && complete.failed === 0) {
    toast.info(
      complete.action === 'add-folders-to-gallery'
        ? 'No folders were added to the gallery.'
        : 'No supported images found.',
    );
    return;
  }

  const parts: string[] = [];
  if (complete.imported > 0) parts.push(`Added ${pluralize(complete.imported, 'image')}`);
  if (complete.skipped > 0) {
    parts.push(`${pluralize(complete.skipped, 'image')} already in your gallery`);
  }
  if (complete.failed > 0) parts.push(`${complete.failed} failed`);

  const message = `${parts.join('. ')}.`;
  if (complete.failed > 0) toast.info(message);
  else toast.success(message);
}

function ExternalImportProgressPill({ progress }: { progress: ExternalImportProgress }) {
  const pct =
    progress.total > 0 ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100)) : 0;
  const fileName = progress.currentPath?.split(/[\\/]/).pop() ?? '';

  return (
    <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-[90] animate-fade-in">
      <div className="flex items-center gap-3 bg-white rounded-full shadow-xl shadow-black/10 border border-gray-200/60 px-4 py-2 min-w-[280px] max-w-[520px]">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-lavender border-t-ink shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 text-xs text-ink">
            <span className="truncate">{PROGRESS_LABELS[progress.action]}</span>
            <span className="text-ink/50 tabular-nums shrink-0">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="w-full h-1 bg-lavender/30 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {fileName && <div className="text-[10px] text-ink/40 truncate mt-0.5">{fileName}</div>}
        </div>
      </div>
    </div>
  );
}

export function ExternalImportBridge() {
  const [boardRequest, setBoardRequest] = useState<ExternalBoardImportRequest | null>(null);
  const [progressByJob, setProgressByJob] = useState<Record<string, ExternalImportProgress>>({});
  const fetchBoards = useBoardStore((s) => s.fetchBoards);
  const loadFolders = useFolderStore((s) => s.load);
  const runQuery = useImageStore((s) => s.runQuery);

  const refreshGallery = useCallback((): void => {
    void runQuery({});
    void fetchBoards();
    void loadFolders();
  }, [fetchBoards, loadFolders, runQuery]);

  useEffect(() => {
    void window.sortieAPI.externalImport.getPendingBoardImport().then((request) => {
      if (request) setBoardRequest(request);
    });

    const unsubscribeBoardRequest = window.sortieAPI.externalImport.onBoardImportRequest(
      (request) => {
        setProgressByJob((state) => {
          const { [request.jobId]: _finished, ...rest } = state;
          return rest;
        });
        setBoardRequest(request);
        toast.info(`${request.imageCount} images ready to add to a board.`);
      },
    );
    const unsubscribeProgress = window.sortieAPI.externalImport.onProgress((progress) => {
      setProgressByJob((state) => ({ ...state, [progress.jobId]: progress }));
    });
    const unsubscribeComplete = window.sortieAPI.externalImport.onComplete((complete) => {
      setProgressByJob((state) => {
        const { [complete.jobId]: _finished, ...rest } = state;
        return rest;
      });
      showCompleteToast(complete);
      refreshGallery();
    });

    return () => {
      unsubscribeBoardRequest();
      unsubscribeProgress();
      unsubscribeComplete();
    };
  }, [refreshGallery]);

  const handleAddToBoard = useCallback(
    async (board: Board) => {
      if (!boardRequest) return;
      try {
        await window.sortieAPI.externalImport.addPendingImagesToBoard(boardRequest.jobId, board.id);
        setBoardRequest(null);
        refreshGallery();
      } catch (error) {
        showIpcError(error, 'Failed to add images to board');
      }
    },
    [boardRequest, refreshGallery],
  );

  const handleClose = useCallback(() => {
    if (boardRequest) {
      void window.sortieAPI.externalImport.dismissPendingBoardImport(boardRequest.jobId);
    }
    setBoardRequest(null);
  }, [boardRequest]);

  const progressValues = Object.values(progressByJob);
  const activeProgress = progressValues[progressValues.length - 1] ?? null;

  return (
    <>
      {activeProgress && <ExternalImportProgressPill progress={activeProgress} />}
      {boardRequest && (
        <BoardPickerModal
          title={`Add ${boardRequest.imageCount} images to board`}
          currentBoardIds={new Set()}
          onAdd={(board) => void handleAddToBoard(board)}
          onRemove={() => undefined}
          onClose={handleClose}
        />
      )}
    </>
  );
}
