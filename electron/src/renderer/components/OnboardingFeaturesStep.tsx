import { Logo } from './Logo';
import { SearchIcon, BoardsIcon, LockIcon, BookIcon, ArrowRightIcon } from './icons';

const FEATURES = [
  { label: 'Search images with words', tone: 'bg-lavender/40 text-ink', Icon: SearchIcon },
  { label: 'Organise by boards', tone: 'bg-mint/40 text-ink', Icon: BoardsIcon },
  { label: 'Get more from the web', tone: 'bg-black/60 text-white', Icon: BookIcon },
  { label: 'Private and local', tone: 'bg-coral/40 text-ink', Icon: LockIcon },
  { label: '... and much more!', tone: 'bg-cream text-ink', Icon: () => <span className="text-xs">✧</span> },
];

export function OnboardingFeaturesStep({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <Logo className="w-20 h-20 mb-5" />
      <h1 id="onboarding-title" className="text-3xl font-semibold text-ink tracking-tight">
        Welcome to Sortie ദ്ദി(˵ •̀ ᴗ - ˵ ) ✧
      </h1>
      <p className="text-sm text-ink/70 mt-2 max-w-md">Your local-first pinboard</p>
      <p className="text-sm text-ink/70 mt-4 max-w-md">
        Search, organise, and collect your photos; everything stays on your machine!
      </p>

      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {FEATURES.map(({ label, tone, Icon }) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${tone}`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </span>
        ))}
      </div>

      <button
        onClick={onGetStarted}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink text-white px-6 py-3 text-sm font-semibold hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
      >
        Get started
        <ArrowRightIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
