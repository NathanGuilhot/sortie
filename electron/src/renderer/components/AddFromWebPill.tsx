import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';
import { useImageStore } from '../stores/imageStore';
import { BookIcon } from './icons';

export function AddFromWebPill() {
  const navigate = useNavigate();
  const searchQuery = useUIStore((s) => s.searchQuery);
  const activeImageQuery = useImageStore((s) => s.activeImageQuery);

  // Hide during reverse-image search: there's no text query to forward to
  // Pinterest, so the pill would deep-link to an empty search.
  if (activeImageQuery) return null;
  if (!searchQuery.trim()) return null;

  const handleClick = () => {
    void navigate(`/import?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-12 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink text-white text-sm font-medium shadow-xl shadow-black/10 hover:bg-ink/90 hover:scale-[1.02] transition-all animate-fade-in"
      title="Search Pinterest for more images"
    >
      <BookIcon className="w-4 h-4" strokeWidth={2} />
      Add more from the web
    </button>
  );
}
