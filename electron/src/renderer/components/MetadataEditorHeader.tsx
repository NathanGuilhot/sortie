import { HeartIcon, XIcon } from './icons';

interface MetadataEditorHeaderProps {
  isFavorite: boolean;
  onClose?: () => void;
  onToggleFavorite: () => void;
}

export function MetadataEditorHeader({
  isFavorite,
  onClose,
  onToggleFavorite,
}: MetadataEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-semibold text-gray-900">Details</h2>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleFavorite}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
            isFavorite
              ? 'text-coral hover:text-coral/80 bg-coral/15'
              : 'text-gray-300 hover:text-coral hover:bg-coral/10'
          }`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon
            className={`w-4 h-4 transition-transform duration-200 ${isFavorite ? 'scale-110' : 'scale-100'}`}
            filled={isFavorite}
          />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XIcon />
        </button>
      </div>
    </div>
  );
}
