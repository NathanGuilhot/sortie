import React, { useState, useEffect, useCallback } from 'react';
import { WithContext as ReactTags, Tag } from 'react-tag-input';
import { useTagStore } from '../stores/tagStore';
import { TagSuggestion } from 'pipeline';

const KeyCodes = {
  comma: 188,
  enter: 13,
};

const delimiters = [KeyCodes.comma, KeyCodes.enter];

interface TagInputProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  allowNew?: boolean;
  showSuggestions?: boolean;
  imageId?: number;
}

export function TagInput({
  selectedTags,
  onChange,
  placeholder = 'Add tags...',
  allowNew = true,
  showSuggestions = true,
  imageId,
}: TagInputProps) {
  const { tags, fetchTags } = useTagStore();
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  // Load tags for autocomplete
  useEffect(() => {
    fetchTags();
  }, []);

  // Convert tags to suggestions format
  useEffect(() => {
    const tagSuggestions = tags.map(tag => ({
      id: tag.id.toString(),
      text: tag.name,
      className: '',
    }));
    setSuggestions(tagSuggestions);
  }, [tags]);

  // Fetch AI suggestions from pipeline
  useEffect(() => {
    if (showSuggestions && imageId) {
      setLoading(true);
      window.sortieAPI.getSuggestions(imageId)
        .then((suggestions) => {
          // Filter out tags already selected
          const filtered = suggestions.filter(s => !selectedTags.includes(s.tagName));
          setAiSuggestions(filtered);
        })
        .catch(err => {
          console.error('Failed to fetch suggestions:', err);
          setAiSuggestions([]);
        })
        .finally(() => setLoading(false));
    } else {
      setAiSuggestions([]);
    }
  }, [imageId, showSuggestions, selectedTags]);

  const handleDelete = useCallback((tagIndex: number) => {
    const newTags = selectedTags.filter((_, i) => i !== tagIndex);
    onChange(newTags);
  }, [selectedTags, onChange]);

  const handleAddition = useCallback((newTag: Tag) => {
    const tagText = newTag.text.trim();
    if (tagText && !selectedTags.includes(tagText)) {
      onChange([...selectedTags, tagText]);
    }
  }, [selectedTags, onChange]);

  const handleDrag = useCallback((tag: Tag, currPos: number, newPos: number) => {
    const newTags = [...selectedTags];
    newTags.splice(currPos, 1);
    newTags.splice(newPos, 0, tag.text);
    onChange(newTags);
  }, [selectedTags, onChange]);

  const handleTagClick = useCallback((index: number) => {
    console.log('Tag clicked:', index);
  }, []);

  const handleAiSuggestionClick = useCallback((suggestion: TagSuggestion) => {
    if (!selectedTags.includes(suggestion.tagName)) {
      onChange([...selectedTags, suggestion.tagName]);
    }
    // Remove from AI suggestions
    setAiSuggestions(prev => prev.filter(s => s.tagId !== suggestion.tagId));
    // Dismiss suggestion via API
    if (imageId) {
      window.sortieAPI.dismissSuggestion(imageId, suggestion.tagId).catch(err => {
        console.error('Failed to dismiss suggestion:', err);
      });
    }
  }, [selectedTags, onChange, imageId]);

  const handleDismissAiSuggestion = useCallback((suggestion: TagSuggestion) => {
    setAiSuggestions(prev => prev.filter(s => s.tagId !== suggestion.tagId));
    // Dismiss suggestion via API
    if (imageId) {
      window.sortieAPI.dismissSuggestion(imageId, suggestion.tagId).catch(err => {
        console.error('Failed to dismiss suggestion:', err);
      });
    }
  }, [imageId]);

  return (
    <div className="tag-input-wrapper">
      <ReactTags
        tags={selectedTags.map(tag => ({ id: tag, text: tag, className: '' })) as any}
        suggestions={suggestions as any}
        delimiters={delimiters}
        handleDelete={handleDelete}
        handleAddition={handleAddition}
        handleDrag={handleDrag}
        handleTagClick={handleTagClick}
        inputFieldPosition="inline"
        placeholder={placeholder}
        allowUnique={true}
        allowDragDrop={true}
        autocomplete={true}
        inline={true}
        allowDeleteFromEmptyInput={true}
        minQueryLength={1}
        classNames={{
          tags: 'tags-container',
          tagInput: 'tag-input',
          tag: 'tag bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium mr-2 mb-2',
          remove: 'tag-remove ml-1 text-blue-600 hover:text-blue-800',
          suggestions: 'suggestions-list bg-white border border-gray-300 rounded shadow-lg mt-1',
          activeSuggestion: 'bg-blue-50',
        }}
      />

      {/* AI Suggestions */}
      {showSuggestions && aiSuggestions.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-2">AI suggestions:</div>
          <div className="flex flex-wrap gap-2">
            {aiSuggestions.map((suggestion) => (
              <div
                key={suggestion.tagId}
                className="flex items-center bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-full px-3 py-1"
              >
                <button
                  onClick={() => handleAiSuggestionClick(suggestion)}
                  className="text-purple-700 hover:text-purple-900 text-sm font-medium"
                >
                  {suggestion.tagName}
                </button>
                <button
                  onClick={() => handleDismissAiSuggestion(suggestion)}
                  className="ml-2 text-gray-400 hover:text-gray-600 text-xs"
                  title="Dismiss suggestion"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-2 text-sm text-gray-500">Loading AI suggestions...</div>
      )}

      <style>{`
        .tags-container {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
        }
        .tag-input {
          display: inline-block;
          min-width: 150px;
        }
        :global(.ReactTags__tagInputField) {
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          padding: 0.5rem 0.75rem;
          width: 100%;
          margin-top: 0.5rem;
        }
        :global(.ReactTags__tagInputField:focus) {
          outline: none;
          ring: 2px solid #3b82f6;
          border-color: #3b82f6;
        }
        :global(.ReactTags__suggestions) {
          position: absolute;
          z-index: 10;
        }
        :global(.ReactTags__suggestions li) {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
        }
        :global(.ReactTags__suggestions li mark) {
          background: yellow;
          font-weight: bold;
        }
        :global(.ReactTags__activeSuggestion) {
          background-color: #eff6ff;
        }
      `}</style>
    </div>
  );
}