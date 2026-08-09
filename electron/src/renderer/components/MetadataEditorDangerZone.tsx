interface MetadataEditorDangerZoneProps {
  canDeleteFile: boolean;
  deleteMode: 'image' | 'file' | null;
  onCancel: () => void;
  onDeleteFile: () => void | Promise<void>;
  onRemoveFromLibrary: () => void | Promise<void>;
}

export function MetadataEditorDangerZone({
  canDeleteFile,
  deleteMode,
  onCancel,
  onDeleteFile,
  onRemoveFromLibrary,
}: MetadataEditorDangerZoneProps) {
  return (
    <div className="pt-4 border-t border-gray-100 space-y-2">
      {deleteMode === 'image' ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onRemoveFromLibrary()}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Confirm remove
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : deleteMode === null ? (
        <button
          onClick={() => void onRemoveFromLibrary()}
          className="w-full px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
        >
          Remove from library
        </button>
      ) : null}

      {deleteMode === 'file' ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => void onDeleteFile()}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              Delete file
            </button>
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">File will be permanently deleted</p>
        </div>
      ) : deleteMode === null ? (
        canDeleteFile ? (
          <button
            onClick={() => void onDeleteFile()}
            className="w-full px-3 py-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors text-center"
          >
            Delete file permanently
          </button>
        ) : (
          <button
            disabled
            title="This file lives on a read-only volume and cannot be deleted from Sortie."
            className="w-full px-3 py-2 text-xs font-medium text-gray-400 cursor-not-allowed text-center"
          >
            Read-only: cannot delete file
          </button>
        )
      ) : null}
    </div>
  );
}
