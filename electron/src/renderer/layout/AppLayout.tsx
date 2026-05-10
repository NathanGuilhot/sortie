import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { version } from '../../../../package.json';
import { AboutModal } from '../components/AboutModal';
import { SettingsModal } from '../components/SettingsModal';
import { Logo } from '../components/Logo';
import {
  PhotoIcon,
  BoardsIcon,
  FolderIcon,
  BookIcon,
  ClipboardIcon,
  PeopleIcon,
  SettingsIcon,
} from '../components/icons';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { useEmbedderStore } from '../stores/embedderStore';

type NavItem = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/gallery', label: 'Gallery', Icon: PhotoIcon },
  { to: '/boards', label: 'Boards', Icon: BoardsIcon },
  { to: '/folders', label: 'Folders', Icon: FolderIcon },
  { to: '/import', label: 'Add from web', Icon: BookIcon },
  { to: '/cleanup', label: 'Cleanup', Icon: ClipboardIcon },
  { to: '/people', label: 'People', Icon: PeopleIcon },
];

const STATUS_COPY: Record<string, string> = {
  '/boards': 'Curate your photos into boards',
  '/folders': 'Manage your photo folders',
  '/import': 'Pull images from Pinterest into your library',
  '/cleanup': 'Find and remove duplicate images',
  '/people': 'Detect and manage people in your photos',
};

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const initEmbedder = useEmbedderStore((s) => s.init);
  const requestFocusSearch = useUIStore((s) => s.requestFocusSearch);
  const requestScrollGalleryToTop = useUIStore((s) => s.requestScrollGalleryToTop);

  const goHomeOrScrollTop = () => {
    if (location.pathname === '/gallery') {
      requestScrollGalleryToTop();
    } else {
      void navigate('/gallery');
    }
  };

  useEffect(() => initEmbedder(), [initEmbedder]);

  useEffect(() => {
    return window.sortieAPI.app.onShowAbout(() => setShowAbout(true));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Stay on /import if already there; otherwise route to the gallery's search.
        if (location.pathname !== '/import') {
          void navigate('/gallery');
        }
        requestFocusSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, requestFocusSearch, location.pathname]);

  return (
    <div className="h-screen bg-cream flex overflow-hidden">
      <div className="w-16 h-screen fixed left-0 top-0 bg-ink text-white flex flex-col z-30">
        <div className="p-3 border-b border-white/10 flex items-center justify-center">
          <button
            type="button"
            onClick={goHomeOrScrollTop}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            aria-label="Go to gallery"
          >
            <Logo className="w-9 h-9" variant="mono" />
          </button>
        </div>

        <nav className="flex-1 p-2">
          <ul className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={(e) => {
                    if (item.to === '/gallery' && location.pathname === '/gallery') {
                      e.preventDefault();
                      requestScrollGalleryToTop();
                    }
                  }}
                  className={({ isActive }) =>
                    `relative group flex items-center justify-center w-full p-2 rounded ${
                      isActive ? 'bg-white/10' : 'hover:bg-white/10'
                    }`
                  }
                >
                  <item.Icon className="w-5 h-5" />
                  <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="relative group flex items-center justify-center w-full p-2 rounded hover:bg-white/10"
            aria-label="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Settings
            </span>
          </button>
          <div className="mt-2 text-center text-xs text-white/50">v{version}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col ml-16 min-w-0">
        <Outlet />

        <footer className="fixed bottom-0 left-16 right-0 z-20 bg-white/95 border-t border-gray-200/60 px-4 py-2 text-sm text-gray-500">
          <div className="flex justify-between items-center">
            <div>
              {location.pathname === '/gallery' ? (
                <GalleryStatus />
              ) : (
                <span>{STATUS_COPY[location.pathname] ?? ''}</span>
              )}
            </div>
            <a
              href="mailto:contact@nighten.fr?subject=Sortie%20feedback"
              className="rounded px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100/70 hover:text-gray-600"
            >
              Send feedback
            </a>
          </div>
        </footer>

        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

function GalleryStatus() {
  const images = useImageStore((s) => s.images);
  const searchQuery = useUIStore((s) => s.searchQuery);

  if (images.length === 0) return <span>No images found</span>;
  if (searchQuery) {
    return (
      <span>
        {images.length} result{images.length !== 1 ? 's' : ''} for "{searchQuery}"
      </span>
    );
  }
  return (
    <span>
      {images.length} image{images.length !== 1 ? 's' : ''}
    </span>
  );
}
