import { useEffect, useMemo, useState } from 'react';
import type { Face, Image, TagSuggestion } from 'shared';
import { useBoardStore } from '../stores/boardStore';
import { useFolderStore } from '../stores/folderStore';
import { useImageStore } from '../stores/imageStore';
import { toast } from '../stores/toastStore';

interface UseMetadataEditorStateArgs {
  image: Image | null;
}

export function useMetadataEditorState({ image }: UseMetadataEditorStateArgs) {
  const { hideImage, deleteImage, updateImageMetadata, addToBoard, setSelectedImage } =
    useImageStore();
  const fetchBoards = useBoardStore((state) => state.fetchBoards);
  const canDeleteFile = useFolderStore((state) =>
    image ? state.isWritable(image.file_path) : false,
  );
  const [date, setDate] = useState('');
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

  useEffect(() => {
    if (image) {
      setDate(image.captured_at ? new Date(image.captured_at).toISOString().split('T')[0] : '');
      setLocation([image.city, image.country].filter(Boolean).join(', ') || '');
      setWebsiteLink(image.website_link || '');
      setDescription(image.description || '');
      setIsFavorite(image.favorite || false);
      return;
    }

    setDate('');
    setLocation('');
    setWebsiteLink('');
    setDescription('');
    setIsFavorite(false);
  }, [image]);

  useEffect(() => {
    void fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (!image) {
      setSuggestions([]);
      setFaces([]);
      return;
    }

    let cancelled = false;
    void Promise.all([
      window.sortieAPI.getSuggestions(image.id),
      window.sortieAPI.getImageFaces(image.id),
    ]).then(([nextSuggestions, nextFaces]: [TagSuggestion[], Face[]]) => {
      if (cancelled) return;
      setSuggestions(nextSuggestions);
      setFaces(nextFaces);
    });

    return () => {
      cancelled = true;
    };
  }, [image]);

  const savedWebsiteLink = useMemo(() => normalizeWebsiteLink(websiteLink), [websiteLink]);
  const originalDate = image?.captured_at
    ? new Date(image.captured_at).toISOString().split('T')[0]
    : '';
  const originalLocation = image
    ? [image.city, image.country].filter(Boolean).join(', ') || ''
    : '';
  const originalDescription = image?.description || '';
  const originalWebsiteLink = image?.website_link || '';
  const isDirty =
    isFavorite !== (image?.favorite || false) ||
    description !== originalDescription ||
    date !== originalDate ||
    location !== originalLocation ||
    (savedWebsiteLink ?? '') !== originalWebsiteLink;
  const hasCamera =
    !!image &&
    !!(
      image.camera_make ||
      image.camera_model ||
      image.aperture ||
      image.iso ||
      image.exposure_time ||
      image.focal_length
    );
  const cameraName = image ? [image.camera_make, image.camera_model].filter(Boolean).join(' ') : '';
  const cameraSettings = image
    ? [
        image.aperture ? `f/${image.aperture}` : null,
        image.exposure_time ? `${image.exposure_time}s` : null,
        image.iso ? `ISO ${image.iso}` : null,
        image.focal_length ? `${image.focal_length}mm` : null,
      ]
        .filter(Boolean)
        .join('  ·  ')
    : '';

  const handleSave = async () => {
    if (!image) return;

    setIsSaving(true);
    try {
      const [city, country] = location.includes(',')
        ? location.split(',').map((value) => value.trim())
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
      if (refreshed) {
        setSelectedImage(refreshed);
      }

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
    setSuggestions((current) => current.filter((item) => item.tagId !== suggestion.tagId));
    void fetchBoards();
  };

  const handleDismissSuggestion = (suggestion: TagSuggestion) => {
    if (!image) return;

    void window.sortieAPI.dismissSuggestion(image.id, suggestion.tagId);
    setSuggestions((current) => current.filter((item) => item.tagId !== suggestion.tagId));
  };

  return {
    canDeleteFile,
    date,
    deleteMode,
    description,
    embeddingStatus,
    faces,
    hasCamera,
    cameraName,
    cameraSettings,
    isDirty,
    isFavorite,
    isSaving,
    location,
    saveSuccess,
    savedWebsiteLink,
    suggestions,
    websiteLink,
    setDate,
    setDeleteMode,
    setDescription,
    setIsFavorite,
    setLocation,
    setWebsiteLink,
    handleAcceptSuggestion,
    handleDelete,
    handleDismissSuggestion,
    handleFileDelete,
    handleRecomputeEmbedding,
    handleSave,
  };
}

function normalizeWebsiteLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}
