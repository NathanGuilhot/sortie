import { useState, useEffect } from 'react';
import { Image, Face, TagSuggestion } from 'shared';
import { PaletteRow } from './PaletteRow';
import { AddToBoardButton } from './AddToBoardButton';
import { CopyText } from './CopyText';
import { LinkPreviewCard } from './LinkPreviewCard';
import {
  CopyImageButton,
  MetadataDisclosureSection,
  metadataSaveButtonLabel,
} from './MetadataEditorPrimitives';
import { useImageStore } from '../stores/imageStore';
import { useBoardStore } from '../stores/boardStore';
import { useFolderStore } from '../stores/folderStore';
import { toast } from '../stores/toastStore';
import {
  XIcon,
  PhotoIcon,
  FolderIcon,
  FolderOpenIcon,
  BulbIcon,
  PlusIcon,
  PersonIcon,
  CalendarIcon,
  MapPinIcon,
  LinkIcon,
  DocumentIcon,
  CheckIcon,
  HeartIcon,
} from './icons';

interface MetadataEditorProps {
  image: Image | null;
  onClose?: () => void;
}

export function MetadataEditor({ image, onClose }: MetadataEditorProps) {
  const { hideImage, deleteImage, updateImageMetadata, addToBoard, setSelectedImage } =
    useImageStore();
  const fetchBoards = useBoardStore((s) => s.fetchBoards);
  const canDeleteFile = useFolderStore((s) => (image ? s.isWritable(image.file_path) : false));
  const [date, setDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'image' | 'file' | null>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [faces, setFaces] = useState<Face[]>([]);

  // Reset form when image changes
  useEffect(() => {
    if (image) {
      setDate(image.captured_at ? new Date(image.captured_at).toISOString().split('T')[0] : '');
      setLocation([image.city, image.country].filter(Boolean).join(', ') || '');
      setWebsiteLink(image.website_link || '');
      setDescription(image.description || '');
      setIsFavorite(image.favorite || false);
    } else {
      resetForm();
    }
  }, [image]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  // Fetch AI suggestions when image changes
  useEffect(() => {
    if (!image) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    void window.sortieAPI.getSuggestions(image.id).then((results: TagSuggestion[]) => {
      if (!cancelled) setSuggestions(results);
    });
    return () => {
      cancelled = true;
    };
  }, [image]);

  // Fetch faces for this image
  useEffect(() => {
    if (!image) {
      setFaces([]);
      return;
    }
    let cancelled = false;
    void window.sortieAPI.getImageFaces(image.id).then((results: Face[]) => {
      if (!cancelled) setFaces(results);
    });
    return () => {
      cancelled = true;
    };
  }, [image]);

  const resetForm = () => {
    setDate('');
    setLocation('');
    setWebsiteLink('');
    setDescription('');
    setIsFavorite(false);
    setSuggestions([]);
  };

  const normalizeWebsiteLink = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/\s/.test(trimmed)) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const u = new URL(withScheme);
      if (!u.hostname.includes('.')) return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const savedWebsiteLink = normalizeWebsiteLink(websiteLink);

  const handleSave = async () => {
    if (!image) return;
    setIsSaving(true);
    try {
      const [city, country] = location.includes(',')
        ? location.split(',').map((s) => s.trim())
        : [location.trim(), ''];
      await updateImageMetadata(image.id, {
        description: description || undefined,
        favorite: isFavorite,
        captured_at: date ? new Date(date).toISOString() : null,
        city: city || undefined,
        country: country || undefined,
        website_link: savedWebsiteLink,
      });
      const refreshed = useImageStore.getState().selectedImage;
      if (refreshed) setSelectedImage(refreshed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to save metadata: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!image) return;
    if (deleteMode !== 'image') {
      setDeleteMode('image');
      return;
    }
    await hideImage(image.id);
    setSelectedImage(null);
    setDeleteMode(null);
  };

  const handleFileDelete = async () => {
    if (!image) return;
    if (deleteMode !== 'file') {
      setDeleteMode('file');
      return;
    }
    await deleteImage(image.id);
    setSelectedImage(null);
    setDeleteMode(null);
  };

  const handleRecomputeEmbedding = async () => {
    if (!image) return;
    setEmbeddingStatus('loading');
    try {
      await window.sortieAPI.recomputeEmbedding(image.id);
      setEmbeddingStatus('success');
      setTimeout(() => setEmbeddingStatus('idle'), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to recompute embedding: ${message}`);
      setEmbeddingStatus('error');
      setTimeout(() => setEmbeddingStatus('idle'), 3000);
    }
  };

  const handleAcceptSuggestion = async (suggestion: TagSuggestion) => {
    if (!image) return;
    await addToBoard(image.id, suggestion.tagId);
    setSuggestions(suggestions.filter((s) => s.tagId !== suggestion.tagId));
    void fetchBoards();
  };

  const handleDismissSuggestion = (suggestion: TagSuggestion) => {
    if (!image) return;
    void window.sortieAPI.dismissSuggestion(image.id, suggestion.tagId);
    setSuggestions(suggestions.filter((s) => s.tagId !== suggestion.tagId));
  };

  if (!image) return null;

  const originalDate = image.captured_at
    ? new Date(image.captured_at).toISOString().split('T')[0]
    : '';
  const originalLocation = [image.city, image.country].filter(Boolean).join(', ') || '';
  const originalDescription = image.description || '';
  const originalWebsiteLink = image.website_link || '';
  const isDirty =
    isFavorite !== (image.favorite || false) ||
    description !== originalDescription ||
    date !== originalDate ||
    location !== originalLocation ||
    (savedWebsiteLink ?? '') !== originalWebsiteLink;

  const hasCamera =
    image.camera_make ||
    image.camera_model ||
    image.aperture ||
    image.iso ||
    image.exposure_time ||
    image.focal_length;

  const cameraName = [image.camera_make, image.camera_model].filter(Boolean).join(' ');
  const cameraSettings = [
    image.aperture ? `f/${image.aperture}` : null,
    image.exposure_time ? `${image.exposure_time}s` : null,
    image.iso ? `ISO ${image.iso}` : null,
    image.focal_length ? `${image.focal_length}mm` : null,
  ]
    .filter(Boolean)
    .join('  \u00b7  ');

  const inputClasses =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors text-gray-900 placeholder-gray-400';

  return (
    <div className="p-5">
      {/* [A] Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">Details</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
              isFavorite
                ? 'text-coral hover:text-coral/80 bg-coral/15'
                : 'text-gray-300 hover:text-coral hover:bg-coral/10'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <HeartIcon
              className={`w-4 h-4 transition-transform duration-200 ${isFavorite ? 'scale-110' : 'scale-100'}`}
              filled={isFavorite}
            />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon />
          </button>
        </div>
      </div>

      {/* [B] File identity card */}
      <div className="mb-5 bg-gray-50/80 rounded-xl border border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <PhotoIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="min-w-0 flex-1">
            <CopyImageButton
              filePath={image.file_path}
              label={image.file_name}
              className="text-sm font-medium text-gray-800 truncate block"
            />
            <div className="text-xs text-gray-400">
              {image.width} &times; {image.height}
              {image.file_size ? ` \u00b7 ${(image.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          </div>
          <button
            onClick={() => void window.sortieAPI.revealInFinder(image.file_path)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Reveal in Finder"
          >
            <FolderIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <CopyText
          value={image.file_path}
          className="mt-1.5 text-[11px] text-gray-300 truncate pl-[42px] block"
          title={image.file_path}
        >
          {image.file_path}
        </CopyText>
      </div>

      {/* Color palette */}
      {image.palette && image.palette.length > 0 && (
        <div className="mb-5">
          <PaletteRow palette={image.palette} />
        </div>
      )}

      {/* [C] Editable fields */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <FolderOpenIcon className="w-3.5 h-3.5" strokeWidth={2} />
            Boards
          </label>
          <AddToBoardButton imageId={image.id} imageTags={image.tags || []} />
        </div>

        {/* AI Tag Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
              <BulbIcon className="w-3.5 h-3.5" />
              Suggested
            </label>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <span
                  key={s.tagId}
                  className="group inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-dashed border-ink/30 text-ink rounded-full bg-lavender/20 transition-colors"
                  style={{ opacity: 0.5 + s.confidence * 0.5 }}
                >
                  {s.tagName}
                  <button
                    onClick={() => void handleAcceptSuggestion(s)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-ink/60 hover:text-ink hover:bg-lavender/30 transition-colors"
                    title="Add to board"
                  >
                    <PlusIcon className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => handleDismissSuggestion(s)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-ink/40 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Dismiss"
                  >
                    <XIcon className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detected Faces */}
        {faces.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
              <PersonIcon className="w-3.5 h-3.5" strokeWidth={2} />
              Faces ({faces.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {faces.map((face) => {
                const params = new URLSearchParams({
                  path: image?.file_path || '',
                  x: String(face.bbox_x),
                  y: String(face.bbox_y),
                  w: String(face.bbox_w),
                  h: String(face.bbox_h),
                  size: '80',
                });
                return (
                  <div key={face.id} className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-200">
                      <img
                        src={`sortie-face://${face.id}?${params.toString()}`}
                        alt={face.person_name || 'Unknown'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 truncate max-w-[60px]">
                      {face.person_name || `#${face.person_id ?? '?'}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <CalendarIcon className="w-3.5 h-3.5" />
            Capture Date
          </label>
          <input
            type="date"
            className={inputClasses}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <MapPinIcon className="w-3.5 h-3.5" />
            Location
          </label>
          <input
            type="text"
            className={inputClasses}
            placeholder="City, Country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <LinkIcon className="w-3.5 h-3.5" />
            Website Link
          </label>
          <input
            type="text"
            inputMode="url"
            className={inputClasses}
            placeholder="https://example.com"
            value={websiteLink}
            onChange={(e) => setWebsiteLink(e.target.value)}
          />
          {image.website_link && savedWebsiteLink === image.website_link && (
            <LinkPreviewCard url={image.website_link} />
          )}
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <DocumentIcon className="w-3.5 h-3.5" />
            Description
          </label>
          <textarea
            className={`${inputClasses} resize-none h-24`}
            placeholder="Describe this image..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      {/* [D] Save button */}
      <div className="mb-6">
        <button
          onClick={() => void handleSave()}
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
            {metadataSaveButtonLabel({ isSaving, saveSuccess, isDirty })}
            {saveSuccess && <CheckIcon />}
          </span>
        </button>
      </div>

      {/* [E] Camera info — collapsible */}
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

      {/* [F] File info — collapsible */}
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
            onClick={() => void handleRecomputeEmbedding()}
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
                  ? 'Failed \u2014 try again'
                  : 'Recompute embedding'}
          </button>
        </MetadataDisclosureSection>
      </div>

      {/* [G] Danger zone */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        {deleteMode === 'image' ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleDelete()}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              Confirm remove
            </button>
            <button
              onClick={() => setDeleteMode(null)}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : deleteMode === null ? (
          <button
            onClick={() => void handleDelete()}
            className="w-full px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
          >
            Remove from library
          </button>
        ) : null}
        {deleteMode === 'file' ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleFileDelete()}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete file
              </button>
              <button
                onClick={() => setDeleteMode(null)}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center">
              File will be permanently deleted
            </p>
          </div>
        ) : deleteMode === null ? (
          canDeleteFile ? (
            <button
              onClick={() => void handleFileDelete()}
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
              Read-only — cannot delete file
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
