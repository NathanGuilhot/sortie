import { useEffect, useState } from 'react';
import { FolderWithStats, Person } from 'shared';
import { showIpcError } from '../../ipc';
import { TagInput } from '../TagInput';
import { PaletteSearchPicker } from '../PaletteSearchPicker';
import { buildFaceThumbUrl } from '../faceThumb';
import { HeartIcon, PersonIcon } from '../icons';

interface SearchBarAdvancedFiltersProps {
  folders: FolderWithStats[];
  folderFilter: number | null;
  setFolderFilter: (value: number | null) => void;
  tagFilters: string[];
  setTagFilters: (value: string[]) => void;
  persons: Person[];
  personFilter: number | null;
  setPersonFilter: (value: number | null) => void;
  paletteFilters: string[];
  setPaletteFilters: (value: string[]) => void;
  dateRange: { start: Date | null; end: Date | null };
  setDateRange: (value: { start: Date | null; end: Date | null }) => void;
  showFavoritesOnly: boolean;
  setShowFavoritesOnly: (value: boolean) => void;
  showHidden: boolean;
  setShowHidden: (value: boolean) => void;
  showDivider: boolean;
}

export function SearchBarAdvancedFilters({
  folders,
  folderFilter,
  setFolderFilter,
  tagFilters,
  setTagFilters,
  persons,
  personFilter,
  setPersonFilter,
  paletteFilters,
  setPaletteFilters,
  dateRange,
  setDateRange,
  showFavoritesOnly,
  setShowFavoritesOnly,
  showHidden,
  setShowHidden,
  showDivider,
}: SearchBarAdvancedFiltersProps) {
  function handleDateChange(field: 'start' | 'end', value: string): void {
    const nextDate = value ? new Date(value) : null;
    setDateRange({
      ...dateRange,
      [field]: nextDate,
    });
  }

  return (
    <div className={`px-4 py-3 space-y-3 ${showDivider ? 'border-t border-gray-100' : ''}`}>
      {folders.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by folder</label>
          <select
            value={folderFilter ?? ''}
            onChange={(event) => setFolderFilter(event.target.value ? Number(event.target.value) : null)}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
          >
            <option value="">All folders</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.folder_name} ({folder.image_count})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by board</label>
        <TagInput
          selectedTags={tagFilters}
          onChange={setTagFilters}
          placeholder="Add boards..."
          suggestionCategories={['user', 'ai']}
        />
      </div>

      {persons.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by person</label>
          <div className="flex flex-wrap gap-2">
            {persons.map((person) => (
              <PersonFilterChip
                key={person.id}
                person={person}
                selected={personFilter === person.id}
                onToggle={() => setPersonFilter(personFilter === person.id ? null : person.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by color</label>
        <PaletteSearchPicker colors={paletteFilters} onChange={setPaletteFilters} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">Date range</label>
        <div className="flex gap-2">
          <input
            type="date"
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
            value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
            onChange={(event) => handleDateChange('start', event.target.value)}
          />
          <span className="text-gray-300 self-center text-xs">to</span>
          <input
            type="date"
            className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
            value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
            onChange={(event) => handleDateChange('end', event.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className="flex items-center gap-1.5 cursor-pointer"
          title="Favorites only"
        >
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
              showFavoritesOnly ? 'bg-coral' : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            <HeartIcon
              className={`w-[11px] h-[11px] ${showFavoritesOnly ? 'text-white' : 'text-gray-500'}`}
              filled={showFavoritesOnly}
              strokeWidth={showFavoritesOnly ? 0 : 2}
            />
          </div>
          <span className="text-xs text-gray-600">Favorites</span>
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 text-ink rounded border-gray-300"
            checked={showHidden}
            onChange={(event) => setShowHidden(event.target.checked)}
          />
          <span className="text-xs text-gray-600">Hidden images</span>
        </label>
      </div>
    </div>
  );
}

function PersonFilterChip({
  person,
  selected,
  onToggle,
}: {
  person: Person;
  selected: boolean;
  onToggle: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!person.thumbnail_face_id) return;

    let cancelled = false;
    window.sortieAPI
      .getPersonImages(person.id, 1)
      .then(async (images) => {
        if (cancelled || images.length === 0) return;
        const faces = await window.sortieAPI.getImageFaces(images[0].id);
        const personFace = faces.find((face) => face.person_id === person.id);
        if (!cancelled && personFace) {
          setThumbUrl(buildFaceThumbUrl(personFace));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        showIpcError(error, 'Failed to load person thumbnail');
      });

    return () => {
      cancelled = true;
    };
  }, [person.id, person.thumbnail_face_id]);

  const label = person.name || `Person ${person.id}`;

  return (
    <button
      onClick={onToggle}
      title={`${label} (${person.face_count})`}
      className={`relative w-10 h-10 rounded-full overflow-hidden transition-all ${
        selected ? 'ring-2 ring-ink ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'
      }`}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={label} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400">
          <PersonIcon className="w-5 h-5" />
        </div>
      )}
    </button>
  );
}
