import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../stores/uiStore';

export function AddFromWebPill() {
  const navigate = useNavigate();
  const searchQuery = useUIStore((s) => s.searchQuery);

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
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
      Add more from the web
    </button>
  );
}
