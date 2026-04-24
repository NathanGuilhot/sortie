import type { Face, Image, TagSuggestion } from 'shared';
import { AddToBoardButton } from './AddToBoardButton';
import { LinkPreviewCard } from './LinkPreviewCard';
import {
  BulbIcon,
  CalendarIcon,
  DocumentIcon,
  FolderOpenIcon,
  LinkIcon,
  MapPinIcon,
  PersonIcon,
  PlusIcon,
  XIcon,
} from './icons';

interface MetadataEditorFormSectionProps {
  image: Image;
  date: string;
  description: string;
  faces: Face[];
  location: string;
  savedWebsiteLink: string | null;
  suggestions: TagSuggestion[];
  websiteLink: string;
  onAcceptSuggestion(suggestion: TagSuggestion): void | Promise<void>;
  onChangeDate(value: string): void;
  onChangeDescription(value: string): void;
  onChangeLocation(value: string): void;
  onChangeWebsiteLink(value: string): void;
  onDismissSuggestion(suggestion: TagSuggestion): void;
}

export function MetadataEditorFormSection({
  image,
  date,
  description,
  faces,
  location,
  savedWebsiteLink,
  suggestions,
  websiteLink,
  onAcceptSuggestion,
  onChangeDate,
  onChangeDescription,
  onChangeLocation,
  onChangeWebsiteLink,
  onDismissSuggestion,
}: MetadataEditorFormSectionProps) {
  const inputClasses =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors text-gray-900 placeholder-gray-400';

  return (
    <div className="space-y-4 mb-6">
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
          <FolderOpenIcon className="w-3.5 h-3.5" strokeWidth={2} />
          Boards
        </label>
        <AddToBoardButton imageId={image.id} imageTags={image.tags || []} />
      </div>

      {suggestions.length > 0 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <BulbIcon className="w-3.5 h-3.5" />
            Suggested
          </label>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <span
                key={suggestion.tagId}
                className="group inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border border-dashed border-ink/30 text-ink rounded-full bg-lavender/20 transition-colors"
                style={{ opacity: 0.5 + suggestion.confidence * 0.5 }}
              >
                {suggestion.tagName}
                <button
                  onClick={() => void onAcceptSuggestion(suggestion)}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-ink/60 hover:text-ink hover:bg-lavender/30 transition-colors"
                  title="Add to board"
                >
                  <PlusIcon className="w-3 h-3" strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => onDismissSuggestion(suggestion)}
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

      {faces.length > 0 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
            <PersonIcon className="w-3.5 h-3.5" strokeWidth={2} />
            Faces ({faces.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {faces.map((face) => {
              const params = new URLSearchParams({
                path: image.file_path,
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
          onChange={(event) => onChangeDate(event.target.value)}
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
          onChange={(event) => onChangeLocation(event.target.value)}
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
          onChange={(event) => onChangeWebsiteLink(event.target.value)}
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
          onChange={(event) => onChangeDescription(event.target.value)}
        />
      </div>
    </div>
  );
}
