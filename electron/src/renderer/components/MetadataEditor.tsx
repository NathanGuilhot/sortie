import { useState, useEffect } from 'react';
import { Image } from 'shared';
import { TagInput } from './TagInput';
import { useImageStore } from '../stores/imageStore';

interface MetadataEditorProps {
  image: Image | null;
  onClose?: () => void;
}

export function MetadataEditor({ image, onClose }: MetadataEditorProps) {
  const { updateImageTags, hideImage, updateImageMetadata, setSelectedImage, fetchImages } = useImageStore();
  const [tags, setTags] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Reset form when image changes
  useEffect(() => {
    if (image) {
      setTags(image.tags?.map(t => t.name) || []);
      setDate(image.captured_at ? new Date(image.captured_at).toISOString().split('T')[0] : '');
      setLocation([image.city, image.country].filter(Boolean).join(', ') || '');
      setDescription(image.description || '');
      setIsFavorite(image.favorite || false);
    } else {
      resetForm();
    }
  }, [image]);

  const resetForm = () => {
    setTags([]);
    setDate('');
    setLocation('');
    setDescription('');
    setIsFavorite(false);
  };

  const handleSave = async () => {
    if (!image) return;
    setIsSaving(true);
    try {
      await updateImageTags(image.id, tags);
      const [city, country] = location.includes(',')
        ? location.split(',').map(s => s.trim())
        : [location.trim(), ''];
      await updateImageMetadata(image.id, {
        description: description || undefined,
        captured_at: date ? new Date(date).toISOString() : null,
        city: city || undefined,
        country: country || undefined,
      });
      await fetchImages();
      const updatedImages = useImageStore.getState().images;
      const updated = updatedImages.find(img => img.id === image.id);
      if (updated) setSelectedImage(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!image) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await hideImage(image.id);
    setSelectedImage(null);
    setConfirmingDelete(false);
  };

  const handleRecomputeEmbedding = async () => {
    if (!image) return;
    setEmbeddingStatus('loading');
    try {
      await window.sortieAPI.recomputeEmbedding(image.id);
      setEmbeddingStatus('success');
      setTimeout(() => setEmbeddingStatus('idle'), 2000);
    } catch {
      setEmbeddingStatus('error');
      setTimeout(() => setEmbeddingStatus('idle'), 3000);
    }
  };

  if (!image) return null;

  const inputClasses = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors text-gray-900 placeholder-gray-400';

  return (
    <div className="p-5">
      {/* [A] Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">Details</h2>
        <div className="flex items-center gap-1">
          {/* Heart toggle */}
          <button
            onClick={async () => {
              const newValue = !isFavorite;
              setIsFavorite(newValue);
              await updateImageMetadata(image.id, { favorite: newValue });
              const updatedImages = useImageStore.getState().images;
              const updated = updatedImages.find(img => img.id === image.id);
              if (updated) setSelectedImage(updated);
            }}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
              isFavorite
                ? 'text-rose-500 hover:text-rose-600 bg-rose-50'
                : 'text-gray-300 hover:text-rose-400 hover:bg-rose-50'
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
          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* [B] File identity card */}
      <div className="mb-5 bg-gray-50/80 rounded-xl border border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">{image.file_name}</div>
            <div className="text-xs text-gray-400">
              {image.width} &times; {image.height}
              {image.file_size ? ` \u00b7 ${(image.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* [C] Editable fields */}
      <div className="space-y-4 mb-6">
        {/* Tags */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Tags
          </label>
          <TagInput
            selectedTags={tags}
            onChange={setTags}
            placeholder="Add tags..."
          />
        </div>

        {/* Capture Date */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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

        {/* Location */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
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

        {/* Description */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
          onClick={handleSave}
          disabled={isSaving}
          className={`w-full px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            saveSuccess
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {isSaving && (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save changes'}
            {saveSuccess && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        </button>
      </div>

      {/* [E] File info card */}
      <div className="bg-gray-50/80 rounded-xl border border-gray-100 px-4 py-3 mb-6">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">File Info</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Created</span>
            <span className="text-gray-600 font-medium">{new Date(image.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Modified</span>
            <span className="text-gray-600 font-medium">{new Date(image.modified_at).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Type</span>
            <span className="text-gray-600 font-medium">{image.mime_type || 'Unknown'}</span>
          </div>
          {image.latitude != null && image.longitude != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Coordinates</span>
              <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-gray-500 font-mono text-[11px]">
                {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
              </span>
            </div>
          )}
        </div>

        {/* Recompute embedding */}
        <button
          onClick={handleRecomputeEmbedding}
          disabled={embeddingStatus === 'loading'}
          className={`mt-3 w-full px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            embeddingStatus === 'success'
              ? 'border-emerald-200 text-emerald-600 bg-emerald-50'
              : embeddingStatus === 'error'
              ? 'border-red-200 text-red-500 bg-red-50'
              : 'border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {embeddingStatus === 'loading' ? 'Computing...' :
           embeddingStatus === 'success' ? 'Embedding updated' :
           embeddingStatus === 'error' ? 'Failed \u2014 try again' :
           'Recompute embedding'}
        </button>
      </div>

      {/* [F] Danger zone */}
      <div className="pt-4 border-t border-gray-100">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              Confirm delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="w-full px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
          >
            Remove from library
          </button>
        )}
      </div>
    </div>
  );
}
