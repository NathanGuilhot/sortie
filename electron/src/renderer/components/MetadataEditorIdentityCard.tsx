import type { Image } from 'shared';
import { CopyText } from './CopyText';
import { CopyImageButton } from './MetadataEditorPrimitives';
import { FolderIcon, PhotoIcon } from './icons';

interface MetadataEditorIdentityCardProps {
  image: Image;
}

export function MetadataEditorIdentityCard({ image }: MetadataEditorIdentityCardProps) {
  return (
    <div className="mb-5 bg-gray-50/80 rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <PhotoIcon className="w-4 h-4 text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CopyImageButton
            filePath={image.file_path}
            label={image.file_name}
            className="text-sm font-medium text-gray-800 truncate block"
          />
          <div className="text-xs text-gray-400">
            {image.width} × {image.height}
            {image.file_size ? ` · ${(image.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
        </div>
        <button
          onClick={() => void window.sortieAPI.revealInFinder(image.file_path)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Reveal in Finder"
        >
          <FolderIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <CopyText
        value={image.file_path}
        className="mt-1.5 text-[11px] text-gray-300 truncate pl-[42px] block"
        title={image.file_path}
      >
        {image.file_path}
      </CopyText>
    </div>
  );
}
