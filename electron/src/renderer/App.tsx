import { useState, useEffect, useRef } from 'react';
import { SearchBar } from './components/SearchBar';
import { MasonryGrid } from './components/MasonryGrid';
import { MetadataModal } from './components/MetadataModal';
import { FolderScanner } from './components/FolderScanner';
import { CleanupScreen } from './components/CleanupScreen';
import { PeopleScreen } from './components/PeopleScreen';
import { AboutModal } from './components/AboutModal';
import { useImageStore } from './stores/imageStore';
import { useUIStore } from './stores/uiStore';
import { useEmbedderStore } from './stores/embedderStore';
import { Logo } from './components/Logo';

function App() {
  const { selectedImage, setSelectedImage, images } = useImageStore();
  const clearFilters = useUIStore((s) => s.clearFilters);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const [activeView, setActiveView] = useState<'gallery' | 'folders' | 'cleanup' | 'people'>(() => {
    const saved = localStorage.getItem('sortie:activeView');
    if (saved === 'gallery' || saved === 'folders' || saved === 'cleanup' || saved === 'people') return saved;
    return 'gallery';
  });
  const [showAbout, setShowAbout] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initEmbedder = useEmbedderStore((s) => s.init);

  useEffect(() => initEmbedder(), [initEmbedder]);

  useEffect(() => {
    return window.sortieAPI.app.onShowAbout(() => setShowAbout(true));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setActiveView('gallery');
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('sortie:activeView', activeView);
    if (activeView !== 'gallery') {
      clearFilters();
    }
  }, [activeView, clearFilters]);

  return (
    <div className="h-screen bg-cream flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-16 h-screen fixed left-0 top-0 bg-ink text-white flex flex-col z-30">
        <div className="p-3 border-b border-white/10 flex items-center justify-center">
          <Logo className="w-9 h-9" variant="mono" />
        </div>

        <nav className="flex-1 p-2">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveView('gallery')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'gallery' ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Gallery
                </span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('folders')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'folders' ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Folders
                </span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('cleanup')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'cleanup' ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Cleanup
                </span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('people')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'people' ? 'bg-white/10' : 'hover:bg-white/10'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-ink text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  People
                </span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-center text-xs text-white/50">v0.1</div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col ml-16">
        {/* Floating search bar — gallery only */}
        {activeView === 'gallery' && <SearchBar inputRef={searchInputRef} scrollContainerRef={scrollContainerRef} />}

        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {activeView === 'gallery' && (
            <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-16 pb-10">
              <MasonryGrid scrollContainerRef={scrollContainerRef} />
            </div>
          )}
          {activeView === 'gallery' && selectedImage && (
            <MetadataModal
              image={selectedImage}
              onClose={() => setSelectedImage(null)}
              onNavigate={(img) => setSelectedImage(img)}
            />
          )}
          {activeView === 'folders' && <FolderScanner />}
          {activeView === 'cleanup' && <CleanupScreen />}
          {activeView === 'people' && <PeopleScreen />}
          {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
        </main>

        {/* Status bar */}
        <footer className="fixed bottom-0 left-16 right-0 z-20 bg-white/80 backdrop-blur-lg border-t border-gray-200/60 px-4 py-2 text-sm text-gray-500">
          <div className="flex justify-between items-center">
            <div>
              {activeView === 'gallery' && (
                <span>
                  {images.length > 0
                    ? searchQuery
                      ? `${images.length} result${images.length !== 1 ? 's' : ''} for "${searchQuery}"`
                      : `${images.length} image${images.length !== 1 ? 's' : ''}`
                    : 'No images found'}
                </span>
              )}
              {activeView === 'folders' && <span>Manage your photo folders</span>}
              {activeView === 'cleanup' && <span>Find and remove duplicate images</span>}
              {activeView === 'people' && <span>Detect and manage people in your photos</span>}
            </div>
            <div />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
