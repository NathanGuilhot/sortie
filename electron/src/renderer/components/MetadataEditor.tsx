import { Image } from 'shared';
import { PaletteRow } from './PaletteRow';
import { MetadataEditorDangerZone } from './MetadataEditorDangerZone';
import { MetadataEditorFormSection } from './MetadataEditorFormSection';
import { MetadataEditorHeader } from './MetadataEditorHeader';
import { MetadataEditorIdentityCard } from './MetadataEditorIdentityCard';
import { MetadataEditorSupplementarySections } from './MetadataEditorSupplementarySections';
import { useMetadataEditorState } from './useMetadataEditorState';

interface MetadataEditorProps {
  image: Image | null;
  onClose?: () => void;
}

export function MetadataEditor({ image, onClose }: MetadataEditorProps) {
  const state = useMetadataEditorState({ image });
  if (!image) return null;

  return (
    <div className="p-5">
      <MetadataEditorHeader
        isFavorite={state.isFavorite}
        onClose={onClose}
        onToggleFavorite={() => state.setIsFavorite(!state.isFavorite)}
      />
      <MetadataEditorIdentityCard image={image} />
      {image.palette && image.palette.length > 0 && (
        <div className="mb-5">
          <PaletteRow palette={image.palette} />
        </div>
      )}
      <MetadataEditorFormSection
        image={image}
        date={state.date}
        description={state.description}
        faces={state.faces}
        location={state.location}
        savedWebsiteLink={state.savedWebsiteLink}
        suggestions={state.suggestions}
        websiteLink={state.websiteLink}
        onAcceptSuggestion={state.handleAcceptSuggestion}
        onChangeDate={state.setDate}
        onChangeDescription={state.setDescription}
        onChangeLocation={state.setLocation}
        onChangeWebsiteLink={state.setWebsiteLink}
        onDismissSuggestion={state.handleDismissSuggestion}
      />
      <MetadataEditorSupplementarySections
        cameraName={state.cameraName}
        cameraSettings={state.cameraSettings}
        embeddingStatus={state.embeddingStatus}
        hasCamera={state.hasCamera}
        image={image}
        isDirty={state.isDirty}
        isSaving={state.isSaving}
        saveSuccess={state.saveSuccess}
        onRecomputeEmbedding={state.handleRecomputeEmbedding}
        onSave={state.handleSave}
      />
      <MetadataEditorDangerZone
        canDeleteFile={state.canDeleteFile}
        deleteMode={state.deleteMode}
        onCancel={() => state.setDeleteMode(null)}
        onDeleteFile={state.handleFileDelete}
        onRemoveFromLibrary={state.handleDelete}
      />
    </div>
  );
}
