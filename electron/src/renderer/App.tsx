import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { MasonryGrid } from './components/MasonryGrid';
import { MetadataModal } from './components/MetadataModal';
import { FolderScanner } from './components/FolderScanner';
import { useImageStore } from './stores/imageStore';

function App() {
  const { images, selectedImage, setSelectedImage } = useImageStore();
  const [activeView, setActiveView] = useState<'gallery' | 'folders'>('gallery');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentIndex = useMemo(
    () => selectedImage ? images.findIndex(img => img.id === selectedImage.id) : -1,
    [selectedImage, images]
  );
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < images.length - 1;
  const handlePrev = useCallback(() => {
    if (hasPrev) setSelectedImage(images[currentIndex - 1]);
  }, [hasPrev, currentIndex, images, setSelectedImage]);
  const handleNext = useCallback(() => {
    if (hasNext) setSelectedImage(images[currentIndex + 1]);
  }, [hasNext, currentIndex, images, setSelectedImage]);

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

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-16 h-screen fixed left-0 top-0 bg-gray-900 text-white flex flex-col z-30">
        <div className="p-4 border-b border-gray-800 flex items-center justify-center">
          <span className="text-lg font-bold">S</span>
        </div>

        <nav className="flex-1 p-2">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveView('gallery')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'gallery' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Gallery
                </span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('folders')}
                className={`relative group flex items-center justify-center w-full p-2 rounded ${activeView === 'folders' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  Folders
                </span>
              </button>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-center text-xs text-gray-400">v0.1</div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col ml-16">
        {/* Floating search bar — gallery only */}
        {activeView === 'gallery' && <SearchBar inputRef={searchInputRef} />}

        {/* Header — folders only */}
        {activeView === 'folders' && (
          <header className="bg-white shadow">
            <div className="px-6 py-4">
              <h1 className="text-2xl font-bold text-gray-900">Folder Management</h1>
            </div>
          </header>
        )}

        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {activeView === 'gallery' && (
            <div ref={scrollContainerRef} className="h-full overflow-y-auto pt-16">
              <MasonryGrid scrollContainerRef={scrollContainerRef} />
            </div>
          )}
          {activeView === 'gallery' && selectedImage && (
            <MetadataModal
              image={selectedImage}
              onClose={() => setSelectedImage(null)}
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrev={hasPrev}
              hasNext={hasNext}
            />
          )}
          {activeView === 'folders' && (
            <div className="p-6">
              <FolderScanner />
            </div>
          )}
        </main>

        {/* Status bar */}
        <footer className="bg-white border-t border-gray-200 px-4 py-2 text-sm text-gray-500">
          <div className="flex justify-between items-center">
            <div>
              {activeView === 'gallery' && (
                <span>Click an image to edit metadata</span>
              )}
              {activeView === 'folders' && (
                <span>Add folders to start organizing your photos</span>
              )}
            </div>
            <div />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;