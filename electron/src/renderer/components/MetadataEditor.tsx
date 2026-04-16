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
        favorite: isFavorite,
        captured_at: date ? new Date(date).toISOString() : null,
        city: city || undefined,
        country: country || undefined,
      });
      await fetchImages();
      // Refresh selectedImage so tags reload in the editor
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

  return (
    <div>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Details</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* File info */}
        <div className="mb-6 text-sm text-gray-600">
          <div className="truncate">{image.file_name}</div>
          <div className="text-xs text-gray-500">
            {image.width} × {image.height} • {image.file_size ? `${(image.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown size'}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <TagInput
            selectedTags={tags}
            onChange={setTags}
            placeholder="Add tags..."
          />
        </div>

        {/* Date */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Capture Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Location */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Location
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded"
            placeholder="City, Country"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded h-32"
            placeholder="Describe this image..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Favorite toggle */}
        <div className="mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="h-4 w-4 text-blue-600 rounded"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
            />
            <span className="ml-2 text-sm text-gray-700">Mark as favorite</span>
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${saveSuccess ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Changes'}
          </button>
          {confirmingDelete ? (
            <div className="flex space-x-2">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>

        {/* Metadata info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Metadata</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Created:</span>
              <span>{new Date(image.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Modified:</span>
              <span>{new Date(image.modified_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">MIME type:</span>
              <span>{image.mime_type || 'Unknown'}</span>
            </div>
            {image.latitude && image.longitude && (
              <div className="flex justify-between">
                <span className="text-gray-500">Coordinates:</span>
                <span>{image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleRecomputeEmbedding}
            disabled={embeddingStatus === 'loading'}
            className={`mt-4 w-full px-3 py-1.5 text-sm rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
              embeddingStatus === 'success'
                ? 'border-green-300 text-green-600 bg-green-50'
                : embeddingStatus === 'error'
                ? 'border-red-300 text-red-600 bg-red-50'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {embeddingStatus === 'loading' ? 'Computing...' :
             embeddingStatus === 'success' ? 'Embedding updated' :
             embeddingStatus === 'error' ? 'Failed — try again' :
             'Recompute embedding'}
          </button>
        </div>
      </div>
    </div>
  );
}