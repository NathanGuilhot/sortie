import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AboutModal } from '../components/AboutModal';
import { Logo } from '../components/Logo';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { useEmbedderStore } from '../stores/embedderStore';

type NavItem = {
  to: string;
  label: string;
  icon: JSX.Element;
};

const NAV_ITEMS: NavItem[] = [
  {
    to: '/gallery',
    label: 'Gallery',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    ),
  },
  {
    to: '/folders',
    label: 'Folders',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    ),
  },
  {
    to: '/cleanup',
    label: 'Cleanup',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    ),
  },
  {
    to: '/people',
    label: 'People',
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    ),
  },
];

const STATUS_COPY: Record<string, string> = {
  '/folders': 'Manage your photo folders',
  '/cleanup': 'Find and remove duplicate images',
  '/people': 'Detect and manage people in your photos',
};

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAbout, setShowAbout] = useState(false);
  const initEmbedder = useEmbedderStore((s) => s.init);
  const requestFocusSearch = useUIStore((s) => s.requestFocusSearch);

  useEffect(() => initEmbedder(), [initEmbedder]);

  useEffect(() => {
    return window.sortieAPI.app.onShowAbout(() => setShowAbout(true));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        navigate('/gallery');
        requestFocusSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, requestFocusSearch]);

  return (
    <div className="h-screen bg-cream flex overflow-hidden">
      <div className="w-16 h-screen fixed left-0 top-0 bg-ink text-white flex flex-col z-30">
        <div className="p-3 border-b border-white/10 flex items-center justify-center">
          <Logo className="w-9 h-9" variant="mono" />
        </div>

        <nav className="flex-1 p-2">
          <ul className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `relative group flex items-center justify-center w-full p-2 rounded ${
                      isActive ? 'bg-white/10' : 'hover:bg-white/10'
                    }`
                  }
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {item.icon}
                  </svg>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-center text-xs text-white/50">v0.1</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col ml-16">
        <Outlet />

        <footer className="fixed bottom-0 left-16 right-0 z-20 bg-white/80 backdrop-blur-lg border-t border-gray-200/60 px-4 py-2 text-sm text-gray-500">
          <div className="flex justify-between items-center">
            <div>
              {location.pathname === '/gallery' ? (
                <GalleryStatus />
              ) : (
                <span>{STATUS_COPY[location.pathname] ?? ''}</span>
              )}
            </div>
            <div />
          </div>
        </footer>

        {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
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
