import { useEffect, useState } from 'react';
import { Logo } from './Logo';

const REPO_URL = 'https://github.com/nathanguilhot/sortie';
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void window.sortieAPI.app.getVersion().then(setVersion);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const openExternal = (url: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    void window.sortieAPI.app.openExternal(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-[440px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center px-8 pt-8 pb-6 text-center">
          <Logo className="w-20 h-20 mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">Sortie</h1>
          <p className="text-sm text-gray-500 mt-1">Version {version || '…'}</p>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            Local-first photo tagger with CLIP embeddings and face detection.
          </p>
        </div>

        <div className="px-8 py-4 border-t border-gray-100 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Author</span>
            <span className="text-gray-900">Nathan Guilhot</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>License</span>
            <a
              href={LICENSE_URL}
              onClick={openExternal(LICENSE_URL)}
              className="text-ink hover:underline"
            >
              MIT
            </a>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Source</span>
            <a
              href={REPO_URL}
              onClick={openExternal(REPO_URL)}
              className="text-ink hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>

        <div className="px-8 py-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
          <p className="font-medium text-gray-700 mb-1">Credits</p>
          <p>
            CLIP embeddings via{' '}
            <a
              href="https://github.com/xenova/transformers.js"
              onClick={openExternal('https://github.com/xenova/transformers.js')}
              className="text-ink hover:underline"
            >
              @xenova/transformers
            </a>
            . Face detection via{' '}
            <a
              href="https://github.com/vladmandic/face-api"
              onClick={openExternal('https://github.com/vladmandic/face-api')}
              className="text-ink hover:underline"
            >
              @vladmandic/face-api
            </a>
            . Built with Electron.
          </p>
        </div>

        <div className="px-8 py-4 bg-cream flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-ink text-white text-sm rounded-md hover:bg-ink/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
