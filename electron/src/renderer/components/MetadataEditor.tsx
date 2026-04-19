import { useState, useEffect, useRef } from 'react';
import { Image, Face } from 'shared';
import { PaletteRow } from './PaletteRow';
import { AddToBoardButton } from './AddToBoardButton';
import { CopyText } from './CopyText';
import { LinkPreviewCard } from './LinkPreviewCard';
import { useImageStore } from '../stores/imageStore';
import { useBoardStore } from '../stores/boardStore';
import { useFolderStore } from '../stores/folderStore';
import { toast } from '../stores/toastStore';

interface TagSuggestion {
  tagId: number;
  tagName: string;
  confidence: number;
  source: 'cluster' | 'similarity';
}

interface MetadataEditorProps {
  image: Image | null;
  onClose?: () => void;
}

function DisclosureSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-50/80 rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-500 transition-colors"
      >
        {title}
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function CopyImageButton({
  filePath,
  label,
  className,
}: {
  filePath: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = () => {
    void window.sortieAPI.copyImageToClipboard(filePath).then((res) => {
      if (!res.success) return;
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span
      className={`cursor-copy select-none ${className ?? ''}`}
      title="Click to copy image"
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCopy();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {copied ? <span className="text-green-500">Copied</span> : label}
    </span>
  );
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingFileDelete, setConfirmingFileDelete] = useState(false);
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
    if (!confirmingDelete) {
      setConfirmingFileDelete(false);
      setConfirmingDelete(true);
      return;
    }
    await hideImage(image.id);
    setSelectedImage(null);
    setConfirmingDelete(false);
  };

  const handleFileDelete = async () => {
    if (!image) return;
    if (!confirmingFileDelete) {
      setConfirmingDelete(false);
      setConfirmingFileDelete(true);
      return;
    }
    await deleteImage(image.id);
    setSelectedImage(null);
    setConfirmingFileDelete(false);
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
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${isFavorite ? 'scale-110' : 'scale-100'}`}
              viewBox="0 0 24 24"
              fill={isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={isFavorite ? 0 : 1.5}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* [B] File identity card */}
      <div className="mb-5 bg-gray-50/80 rounded-xl border border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
              />
            </svg>
            Boards
          </label>
          <AddToBoardButton imageId={image.id} imageTags={image.tags || []} />
        </div>

        {/* AI Tag Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
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
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDismissSuggestion(s)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-ink/40 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Dismiss"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
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
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
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
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
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
            {isSaving
              ? 'Saving...'
              : saveSuccess
                ? 'Saved'
                : isDirty
                  ? 'Save changes'
                  : 'No changes'}
            {saveSuccess && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </span>
        </button>
      </div>

      {/* [E] Camera info — collapsible */}
      {hasCamera && (
        <div className="mb-3">
          <DisclosureSection title="Camera">
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
          </DisclosureSection>
        </div>
      )}

      {/* [F] File info — collapsible */}
      <div className="mb-6">
        <DisclosureSection title="File Info">
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
        </DisclosureSection>
      </div>

      {/* [G] Danger zone */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleDelete()}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              Confirm remove
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          !confirmingFileDelete && (
            <button
              onClick={() => void handleDelete()}
              className="w-full px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
            >
              Remove from library
            </button>
          )
        )}
        {confirmingFileDelete ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleFileDelete()}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete file
              </button>
              <button
                onClick={() => setConfirmingFileDelete(false)}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center">
              File will be permanently deleted
            </p>
          </div>
        ) : (
          !confirmingDelete &&
          (canDeleteFile ? (
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
          ))
        )}
      </div>
    </div>
  );
}
