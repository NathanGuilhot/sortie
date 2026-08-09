import { FolderIcon, ArrowRightIcon } from './icons';

export type SuggestedFolder = {
  path: string;
  exists: boolean;
  approxImageCount: number | null;
  capped: boolean;
};

export function OnboardingFolderStep({
  suggestion,
  working,
  onAdd,
  onSkip,
}: {
  suggestion: SuggestedFolder | null;
  working: null | 'pictures' | 'custom';
  onAdd: (mode: 'pictures' | 'custom') => void;
  onSkip: () => void;
}) {
  const picturesCount = suggestion?.approxImageCount;
  const picturesLabel = suggestion?.exists
    ? picturesCount != null
      ? picturesCount === 0
        ? 'No images found'
        : `${picturesCount.toLocaleString()}${suggestion.capped ? '+' : ''} image${picturesCount === 1 ? '' : 's'} to import`
      : 'Ready to scan'
    : 'Not found: pick a folder instead';

  return (
    <div className="animate-fade-in">
      <h2
        id="onboarding-title"
        className="text-center text-2xl font-semibold text-ink tracking-tight mb-2"
      >
        Pick a folder to start
      </h2>
      <p className="text-center text-sm text-ink/70 mb-8 max-w-md mx-auto">
        Sortie will index the images inside. Nothing ever leaves your machine.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FolderCard
          title="Use my Pictures folder"
          subtitle={suggestion?.path ?? 'Detecting…'}
          hint={picturesLabel}
          primary
          disabled={!suggestion?.exists || working !== null}
          loading={working === 'pictures'}
          onClick={() => onAdd('pictures')}
        />
        <FolderCard
          title="Choose another folder"
          subtitle="Point Sortie at anywhere on your machine"
          disabled={working !== null}
          loading={working === 'custom'}
          onClick={() => onAdd('custom')}
        />
      </div>

      <div className="flex justify-center mt-8">
        <button
          onClick={onSkip}
          disabled={working !== null}
          className="text-xs text-ink/50 hover:text-ink/80 transition-colors disabled:opacity-40"
        >
          Start empty: I'll add folders later
        </button>
      </div>
    </div>
  );
}

function FolderCard({
  title,
  subtitle,
  hint,
  primary,
  disabled,
  loading,
  onClick,
}: {
  title: string;
  subtitle: string;
  hint?: string;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative text-left rounded-2xl border p-5 transition-all duration-200 cursor-pointer overflow-hidden ${
        primary
          ? 'bg-ink text-white border-ink hover:shadow-xl hover:-translate-y-0.5'
          : 'bg-white text-ink border-gray-200 hover:border-ink/40 hover:shadow-md'
      } ${disabled && !loading ? 'opacity-50 cursor-not-allowed hover:shadow-none hover:translate-y-0' : ''}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            primary ? 'bg-white/10' : 'bg-cream'
          }`}
        >
          <FolderIcon
            className={`w-5 h-5 ${primary ? 'text-white' : 'text-ink'}`}
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
        </div>
      </div>
      <div className={`text-xs truncate mb-2 ${primary ? 'text-white/70' : 'text-ink/60'}`}>
        {subtitle}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${primary ? 'text-white/60' : 'text-ink/50'}`}>
          {hint ?? ''}
        </span>
        {loading ? (
          <div
            className={`animate-spin rounded-full h-4 w-4 border-2 ${
              primary ? 'border-white/30 border-t-white' : 'border-ink/20 border-t-ink'
            }`}
          />
        ) : (
          <ArrowRightIcon
            className={`w-4 h-4 transition-transform group-hover:translate-x-0.5 ${
              primary ? 'text-white' : 'text-ink'
            }`}
          />
        )}
      </div>
    </button>
  );
}
