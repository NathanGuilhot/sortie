import type { Image } from 'shared';
import { CopyText } from './CopyText';
import { MetadataDisclosureSection } from './MetadataEditorPrimitives';
import { CheckIcon } from './icons';

function saveButtonLabel(isSaving: boolean, saveSuccess: boolean, isDirty: boolean): string {
  if (isSaving) return 'Saving...';
  if (saveSuccess) return 'Saved';
  if (isDirty) return 'Save changes';
  return 'No changes';
}

interface MetadataEditorSupplementarySectionsProps {
  cameraName: string;
  cameraSettings: string;
  embeddingStatus: 'idle' | 'loading' | 'success' | 'error';
  hasCamera: boolean;
  image: Image;
  isDirty: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  onRecomputeEmbedding: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
}

export function MetadataEditorSupplementarySections({
  cameraName,
  cameraSettings,
  embeddingStatus,
  hasCamera,
  image,
  isDirty,
  isSaving,
  saveSuccess,
  onRecomputeEmbedding,
  onSave,
}: MetadataEditorSupplementarySectionsProps) {
  return (
    <>
      <div className="mb-6">
        <button
          onClick={() => void onSave()}
          disabled={isSaving || (!isDirty && !saveSuccess)}
          className={`w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            saveSuccess
              ? 'bg-mint/30 text-ink border border-mint/50'
              : isDirty
                ? 'bg-ink text-white hover:bg-ink/90 shadow-sm'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {isSaving && (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {saveButtonLabel(isSaving, saveSuccess, isDirty)}
            {saveSuccess && <CheckIcon />}
          </span>
        </button>
      </div>

      {hasCamera && (
        <div className="mb-3">
          <MetadataDisclosureSection title="Camera">
            <div className="space-y-1">
              {cameraName && (
                <CopyText value={cameraName} className="text-sm font-medium text-gray-700 block">
                  {cameraName}
                </CopyText>
              )}
              {cameraSettings && (
                <CopyText value={cameraSettings} className="text-xs text-gray-500 font-mono block">
                  {cameraSettings}
                </CopyText>
              )}
            </div>
          </MetadataDisclosureSection>
        </div>
      )}

      <div className="mb-6">
        <MetadataDisclosureSection title="File Info">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Created</span>
              <span className="text-gray-600 font-medium">
                {new Date(image.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Modified</span>
              <span className="text-gray-600 font-medium">
                {new Date(image.modified_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Type</span>
              <span className="text-gray-600 font-medium">{image.mime_type || 'Unknown'}</span>
            </div>
            {image.latitude != null && image.longitude != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Coordinates</span>
                <CopyText
                  value={`${image.latitude.toFixed(4)}, ${image.longitude.toFixed(4)}`}
                  className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-gray-500 font-mono text-[11px]"
                >
                  {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
                </CopyText>
              </div>
            )}
          </div>

          <button
            onClick={() => void onRecomputeEmbedding()}
            disabled={embeddingStatus === 'loading'}
            className={`mt-3 w-full px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              embeddingStatus === 'success'
                ? 'border-mint/50 text-ink bg-mint/20'
                : embeddingStatus === 'error'
                  ? 'border-gray-300 text-red-500 bg-gray-50'
                  : 'border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {embeddingStatus === 'loading'
              ? 'Computing...'
              : embeddingStatus === 'success'
                ? 'Embedding updated'
                : embeddingStatus === 'error'
                  ? 'Failed — try again'
                  : 'Recompute embedding'}
          </button>
        </MetadataDisclosureSection>
      </div>
    </>
  );
}
