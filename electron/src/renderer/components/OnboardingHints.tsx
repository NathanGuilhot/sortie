import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { XIcon, ArrowRightIcon } from './icons';

export function SearchHint() {
  const onboardingLoaded = useOnboardingStore((s) => s.loaded);
  const completed = useOnboardingStore((s) => s.completed);
  const hintState = useOnboardingStore((s) => s.hints.search);
  const markHint = useOnboardingStore((s) => s.markHint);

  const hasImages = useImageStore((s) => s.images.length > 0);
  const searchQuery = useUIStore((s) => s.searchQuery);

  useEffect(() => {
    if (hintState === 'pending' && searchQuery.trim().length > 0) {
      void markHint('search', 'seen');
    }
  }, [hintState, searchQuery, markHint]);

  if (!onboardingLoaded || !completed || hintState !== 'pending' || !hasImages) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 ml-8 z-10 w-full max-w-xl px-4 pointer-events-none animate-fade-in">
      <div className="relative mx-auto w-fit max-w-full pointer-events-auto">
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-3 h-3 rotate-45 bg-lavender/80 border-l border-t border-lavender"
          aria-hidden="true"
        />
        <div className="flex items-center gap-2.5 bg-lavender/80 border border-lavender text-ink text-xs rounded-full px-4 py-2 shadow-lg shadow-black/5 backdrop-blur-sm">
          <span>
            Try searching in your own words: <em className="not-italic font-medium">“sunset”</em>,{' '}
            <em className="not-italic font-medium">“red coat”</em>…
          </span>
          <button
            onClick={() => void markHint('search', 'dismissed')}
            className="ml-1 p-0.5 rounded-full hover:bg-ink/10 text-ink/60 hover:text-ink transition-colors"
            aria-label="Dismiss hint"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebImportHint() {
  const navigate = useNavigate();
  const onboardingLoaded = useOnboardingStore((s) => s.loaded);
  const completed = useOnboardingStore((s) => s.completed);
  const searchHint = useOnboardingStore((s) => s.hints.search);
  const webHint = useOnboardingStore((s) => s.hints.web);
  const markHint = useOnboardingStore((s) => s.markHint);

  const hasImages = useImageStore((s) => s.images.length > 0);
  const searchQuery = useUIStore((s) => s.searchQuery);

  // Gate on search hint so the two coachmarks don't stack.
  const searchDone = searchHint !== 'pending';

  if (
    !onboardingLoaded ||
    !completed ||
    webHint !== 'pending' ||
    !hasImages ||
    !searchDone ||
    searchQuery.trim().length > 0
  )
    return null;

  const handleClick = () => {
    void markHint('web', 'seen');
    void navigate('/import');
  };

  return (
    <div className="fixed bottom-14 right-6 z-30 animate-fade-in">
      <div className="flex items-stretch bg-white border border-gray-200/60 rounded-full shadow-xl shadow-black/10 overflow-hidden">
        <button
          onClick={handleClick}
          className="flex items-center gap-2 pl-4 pr-3 py-2.5 text-sm text-ink hover:bg-cream transition-colors"
        >
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-coral opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-coral" />
          </span>
          <span className="font-medium">Pull inspiration from the web</span>
          <ArrowRightIcon className="w-3.5 h-3.5 text-ink/50" />
        </button>
        <button
          onClick={() => void markHint('web', 'dismissed')}
          className="px-2.5 border-l border-gray-200/60 text-ink/40 hover:text-ink hover:bg-gray-50 transition-colors"
          aria-label="Dismiss hint"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
