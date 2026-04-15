import React, { useState, useEffect } from 'react';
import { Image } from 'shared';
import { TagInput } from './TagInput';
import { useImageStore } from '../stores/imageStore';

interface MetadataEditorProps {
  image: Image | null;
  onClose?: () => void;
}

export function MetadataEditor({ image, onClose }: MetadataEditorProps) {
  const { updateImageTags } = useImageStore();
  const [tags, setTags] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when image changes
  useEffect(() => {
    if (image) {
      setTags((image as any).tags || []);
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
      // Update tags
      await updateImageTags(image.id, tags);
      // TODO: Update other metadata fields via API
      console.log('Saved metadata for image', image.id);
    } catch (error) {
      console.error('Failed to save metadata:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!image) return;
    if (window.confirm('Are you sure you want to delete this image? This will hide it from the gallery.')) {
      // TODO: Implement hide/delete via API
      console.log('Delete image', image.id);
    }
  };

  if (!image) {
    return (
      <div className="w-80 h-full bg-gray-50 border-l border-gray-200 p-6 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          <div className="text-lg font-medium mb-2">No image selected</div>
          <p className="text-sm">Select an image to view and edit its metadata</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 h-full bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Edit Metadata</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Image preview */}
        <div className="mb-6">
          <img
            src={`file://${image.file_path}`}
            alt={image.file_name}
            className="w-full h-48 object-cover rounded-lg shadow"
          />
          <div className="mt-2 text-sm text-gray-600 truncate">{image.file_name}</div>
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
            showSuggestions={true}
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
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            Delete
          </button>
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
        </div>
      </div>
    </div>
  );
}