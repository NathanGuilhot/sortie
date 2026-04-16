import React, { useEffect, useCallback, useMemo } from 'react';
import { WithContext as ReactTags, Tag } from 'react-tag-input';
import { useTagStore } from '../stores/tagStore';

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
}

export function TagInput({
  selectedTags,
  onChange,
  placeholder = 'Add tags...',
  allowNew: _allowNew = true,
}: TagInputProps) {
  const { tags, fetchTags } = useTagStore();

  // Load tags for autocomplete
  useEffect(() => {
    void fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert tags to suggestions format
  const suggestions = useMemo(
    () =>
      tags.map((tag) => ({
        id: tag.id.toString(),
        text: tag.name,
        className: '',
      })),
    [tags],
  );

  const handleDelete = useCallback(
    (tagIndex: number) => {
      const newTags = selectedTags.filter((_, i) => i !== tagIndex);
      onChange(newTags);
    },
    [selectedTags, onChange],
  );

  const handleAddition = useCallback(
    (newTag: Tag) => {
      const tagText = newTag.text.trim();
      if (tagText && !selectedTags.includes(tagText)) {
        onChange([...selectedTags, tagText]);
      }
    },
    [selectedTags, onChange],
  );

  const handleDrag = useCallback(
    (tag: Tag, currPos: number, newPos: number) => {
      const newTags = [...selectedTags];
      newTags.splice(currPos, 1);
      newTags.splice(newPos, 0, tag.text);
      onChange(newTags);
    },
    [selectedTags, onChange],
  );

  const handleTagClick = useCallback(
    (index: number) => {
      handleDelete(index);
    },
    [handleDelete],
  );

  return (
    <div className="tag-input-wrapper">
      <ReactTags
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        tags={selectedTags.map((tag) => ({ id: tag, text: tag, className: '' })) as any}
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
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
          tags: 'flex flex-wrap gap-1.5 items-center',
          tagInput: 'inline-flex',
          tag: 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors',
          remove: 'ml-0.5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors',
          suggestions:
            'absolute z-20 mt-1 bg-white rounded-xl border border-gray-200/60 shadow-xl shadow-black/5 overflow-hidden',
          activeSuggestion: 'bg-gray-50',
        }}
      />

      <style>{`
        .tag-input-wrapper .ReactTags__tagInputField {
          background: rgb(249 250 251);
          border: 1px solid rgb(229 231 235);
          border-radius: 0.5rem;
          padding: 0.375rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(17 24 39);
          width: 100%;
          margin-top: 0.375rem;
          outline: none;
          transition: all 0.2s;
        }
        .tag-input-wrapper .ReactTags__tagInputField::placeholder {
          color: rgb(156 163 175);
        }
        .tag-input-wrapper .ReactTags__tagInputField:focus {
          background: white;
          border-color: rgb(209 213 219);
        }
        .tag-input-wrapper .ReactTags__suggestions ul {
          list-style: none;
          margin: 0;
          padding: 0.25rem 0;
        }
        .tag-input-wrapper .ReactTags__suggestions li {
          padding: 0.375rem 0.75rem;
          font-size: 0.8125rem;
          color: rgb(75 85 99);
          cursor: pointer;
          transition: background-color 0.15s;
        }
        .tag-input-wrapper .ReactTags__suggestions li:hover {
          background-color: rgb(249 250 251);
        }
        .tag-input-wrapper .ReactTags__suggestions li mark {
          background: rgb(254 249 195);
          color: rgb(75 85 99);
          font-weight: 600;
          border-radius: 2px;
          padding: 0 1px;
        }
        .tag-input-wrapper .ReactTags__activeSuggestion {
          background-color: rgb(249 250 251);
        }
        .tag-input-wrapper .ReactTags__remove {
          border: none;
          background: none;
          font-size: 0;
          line-height: 0;
          padding: 0;
          margin-left: 2px;
          cursor: pointer;
        }
        .tag-input-wrapper .ReactTags__remove::after {
          content: "\\00d7";
          font-size: 14px;
          line-height: 1;
          color: rgb(156 163 175);
          transition: color 0.15s;
        }
        .tag-input-wrapper .ReactTags__remove:hover::after {
          color: rgb(75 85 99);
        }
      `}</style>
    </div>
  );
}
