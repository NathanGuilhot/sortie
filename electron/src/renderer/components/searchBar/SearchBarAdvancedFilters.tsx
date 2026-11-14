import { OriginKind } from 'shared';
import { ORIGIN_KIND_LABELS } from '../originLabels';
import { useUIStore, type OriginFilter } from '../../stores/uiStore';
import { TagInput } from '../TagInput';
import { PaletteSearchPicker } from '../PaletteSearchPicker';
import { HeartIcon } from '../icons';
import { useSearchFilterData } from './useSearchFilterData';

function serializeOrigin(origin: OriginFilter): string {
  if (origin?.kind) return `kind:${origin.kind}`;
  if (origin?.domain) return `domain:${origin.domain}`;
  return '';
}

function parseOrigin(value: string): OriginFilter {
  if (value.startsWith('kind:')) return { kind: value.slice('kind:'.length) as OriginKind };
  if (value.startsWith('domain:')) return { domain: value.slice('domain:'.length) };
  return null;
}

export function SearchBarAdvancedFilters({ showDivider }: { showDivider: boolean }) {
  const {
    dateRange,
    folderFilter,
    originFilter,
    paletteFilters,
    setDateRange,
    setFolderFilter,
    setOriginFilter,
    setPaletteFilters,
    setShowFavoritesOnly,
    setShowHidden,
    setTagFilters,
    showFavoritesOnly,
    showHidden,
    tagFilters,
  } = useUIStore();
  const { folders, origins } = useSearchFilterData();
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
            onChange={(event) =>
              setFolderFilter(event.target.value ? Number(event.target.value) : null)
            }
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

      {(origins.kinds.length > 0 || origins.domains.length > 0) && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Filter by source</label>
          <select
            value={serializeOrigin(originFilter)}
            onChange={(event) => setOriginFilter(parseOrigin(event.target.value))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-gray-300 outline-none transition-colors"
          >
            <option value="">All sources</option>
            {origins.kinds.length > 0 && (
              <optgroup label="How it arrived">
                {origins.kinds.map(({ kind, count }) => (
                  <option key={kind} value={`kind:${kind}`}>
                    {ORIGIN_KIND_LABELS[kind]} ({count})
                  </option>
                ))}
              </optgroup>
            )}
            {origins.domains.length > 0 && (
              <optgroup label="Saved from">
                {origins.domains.map(({ domain, count }) => (
                  <option key={domain} value={`domain:${domain}`}>
                    {domain} ({count})
                  </option>
                ))}
              </optgroup>
            )}
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
