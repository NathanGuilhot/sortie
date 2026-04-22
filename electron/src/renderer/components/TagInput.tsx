import { useEffect, useCallback, useMemo, useState } from 'react';
import { WithContext as ReactTags, Tag } from 'react-tag-input';
import Fuse from 'fuse.js';
import { useTagStore } from '../stores/tagStore';
import { AlertIcon } from './icons';

const KeyCodes = {
  comma: 188,
  enter: 13,
};

const delimiters = [KeyCodes.comma, KeyCodes.enter];

interface TagInputProps {
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  tagCategories?: Map<string, string>;
  // Restrict autocomplete suggestions to tags in these categories. Tags with
  // null categories are always excluded when this prop is provided.
  suggestionCategories?: Array<'user' | 'ai' | 'location' | 'camera'>;
}

const CATEGORY_CLASSES: Record<string, string> = {
  ai: 'bg-lavender/40 text-ink hover:bg-lavender/60',
  location: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
  camera: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
};

const DEFAULT_TAG_CLASS = 'bg-gray-100 hover:bg-gray-200 text-gray-700';

const CATEGORY_DOT: Record<string, string> = {
  ai: 'bg-ink',
  location: 'bg-gray-500',
  camera: 'bg-gray-400',
};

export function TagInput({
  selectedTags,
  onChange,
  placeholder = 'Add tags...',
  tagCategories,
  suggestionCategories,
}: TagInputProps) {
  const { tags, fetchTags } = useTagStore();
  const [inputValue, setInputValue] = useState('');
  const [nearDuplicates, setNearDuplicates] = useState<string[]>([]);

  useEffect(() => {
    void fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleTags = useMemo(() => {
    if (!suggestionCategories || suggestionCategories.length === 0) return tags;
    const allowed = new Set(suggestionCategories);
    return tags.filter((t) => t.category && allowed.has(t.category));
  }, [tags, suggestionCategories]);

  // Build suggestion objects with extra metadata encoded as strings
  const suggestions = useMemo(
    () =>
      visibleTags.map((tag) => ({
        id: tag.id.toString(),
        text: tag.name,
        className: '',
        usageCount: tag.usage_count.toString(),
        category: tag.category || '',
      })),
    [visibleTags],
  );

  // Fuse.js index for fuzzy matching
  const fuse = useMemo(
    () =>
      new Fuse(suggestions, {
        keys: ['text'],
        threshold: 0.4,
        distance: 100,
        includeScore: true,
        minMatchCharLength: 1,
      }),
    [suggestions],
  );

  // Tight fuse for near-duplicate detection
  const tightFuse = useMemo(
    () =>
      new Fuse(
        tags.map((t) => t.name),
        {
          threshold: 0.3,
          distance: 50,
          includeScore: true,
          minMatchCharLength: 2,
        },
      ),
    [tags],
  );

  const handleFilterSuggestions = useCallback(
    (query: string, suggestions: Tag[]) => {
      if (!query || query.length < 1) return suggestions;
      const results = fuse.search(query);
      return results.map((r) => r.item);
    },
    [fuse],
  );

  const renderSuggestion = useCallback((item: Tag, _query: string) => {
    const count = parseInt(item.usageCount || '0', 10);
    const cat = item.category || null;
    const dotClass = cat ? CATEGORY_DOT[cat] : null;

    return (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          {dotClass && (
            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
          )}
          <span className="truncate">{item.text}</span>
        </div>
        {count > 0 && (
          <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0 tabular-nums">{count}</span>
        )}
      </div>
    );
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      const trimmed = value.trim();
      if (!trimmed || trimmed.length < 2) {
        setNearDuplicates([]);
        return;
      }

      const lowerValue = trimmed.toLowerCase();
      const exactExists = tags.some((t) => t.name.toLowerCase() === lowerValue);

      if (!exactExists) {
        const results = tightFuse.search(trimmed);
        const close = results
          .filter((r) => (r.score ?? 1) < 0.3)
          .slice(0, 3)
          .map((r) => r.item);
        setNearDuplicates(close);
      } else {
        setNearDuplicates([]);
      }
    },
    [tags, tightFuse],
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
      setInputValue('');
      setNearDuplicates([]);
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

  const handlePickDuplicate = useCallback(
    (tagName: string) => {
      if (!selectedTags.includes(tagName)) {
        onChange([...selectedTags, tagName]);
      }
      setInputValue('');
      setNearDuplicates([]);
    },
    [selectedTags, onChange],
  );

  return (
    <div className="tag-input-wrapper">
      <ReactTags
        tags={selectedTags.map((tag) => {
          const cat = tagCategories?.get(tag);
          const cls = (cat && CATEGORY_CLASSES[cat]) || DEFAULT_TAG_CLASS;
          return { id: tag, text: tag, className: cls };
        })}
        suggestions={suggestions as Tag[]}
        delimiters={delimiters}
        handleDelete={handleDelete}
        handleAddition={handleAddition}
        handleDrag={handleDrag}
        handleTagClick={handleTagClick}
        handleFilterSuggestions={handleFilterSuggestions}
        renderSuggestion={renderSuggestion}
        handleInputChange={handleInputChange}
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
          tag: 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
          remove: 'ml-0.5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors',
          suggestions:
            'absolute z-20 mt-1 bg-white rounded-xl border border-gray-200/60 shadow-xl shadow-black/5 overflow-hidden',
          activeSuggestion: 'bg-gray-50',
        }}
      />

      {nearDuplicates.length > 0 && inputValue.trim() && (
        <div className="mt-1.5 px-2.5 py-2 text-xs text-gray-600 bg-gray-50 rounded-lg border border-gray-200 flex items-start gap-1.5">
          <AlertIcon className="w-3.5 h-3.5 text-gray-400 mt-px flex-shrink-0" />
          <span>
            Similar:{' '}
            {nearDuplicates.map((name, i) => (
              <span key={name}>
                {i > 0 && ', '}
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePickDuplicate(name)}
                  className="font-medium underline decoration-gray-300 hover:text-gray-900 transition-colors"
                >
                  {name}
                </button>
              </span>
            ))}
          </span>
        </div>
      )}

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
