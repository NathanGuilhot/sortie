import React, { useState } from 'react';
import { SearchBar } from './components/SearchBar';
import { MasonryGrid } from './components/MasonryGrid';
import { MetadataEditor } from './components/MetadataEditor';
import { FolderScanner } from './components/FolderScanner';
import { useImageStore } from './stores/imageStore';
import { useUIStore } from './stores/uiStore';

function App() {
  const { selectedImage, setSelectedImage } = useImageStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [activeView, setActiveView] = useState<'gallery' | 'folders'>('gallery');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white transition-all duration-300 flex flex-col`}>
        <div className="p-4 border-b border-gray-800">
          {sidebarOpen ? (
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">Sortie</h1>
              <button
                onClick={toggleSidebar}
                className="text-gray-400 hover:text-white"
              >
                ←
              </button>
            </div>
          ) : (
            <button
              onClick={toggleSidebar}
              className="w-full text-center text-gray-400 hover:text-white"
            >
              →
            </button>
          )}
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveView('gallery')}
                className={`flex items-center w-full p-2 rounded ${activeView === 'gallery' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
              >
                {sidebarOpen ? (
                  <>
                    <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Gallery
                  </>
                ) : (
                  <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveView('folders')}
                className={`flex items-center w-full p-2 rounded ${activeView === 'folders' ? 'bg-gray-800' : 'hover:bg-gray-800'}`}
              >
                {sidebarOpen ? (
                  <>
                    <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Folders
                  </>
                ) : (
                  <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                )}
              </button>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800">
          {sidebarOpen ? (
            <div className="text-xs text-gray-400">
              <div className="font-medium text-gray-300 mb-1">Sortie v0.1</div>
              <div>AI-powered photo organizer</div>
            </div>
          ) : (
            <div className="text-center text-xs text-gray-400">v0.1</div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-white shadow">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                {activeView === 'gallery' && <SearchBar />}
                {activeView === 'folders' && (
                  <h1 className="text-2xl font-bold text-gray-900">Folder Management</h1>
                )}
              </div>
              <div className="ml-4">
                <button className="p-2 text-gray-600 hover:text-gray-900">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-hidden">
          {activeView === 'gallery' && (
            <div className="h-full flex">
              <div className="flex-1 overflow-y-auto">
                <MasonryGrid />
              </div>
              <MetadataEditor 
                image={selectedImage} 
                onClose={() => setSelectedImage(null)} 
              />
            </div>
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
                <span>Double-click images to edit metadata</span>
              )}
              {activeView === 'folders' && (
                <span>Add folders to start organizing your photos</span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <button className="hover:text-gray-700">Help</button>
              <button className="hover:text-gray-700">Settings</button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;