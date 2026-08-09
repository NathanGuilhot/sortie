import { useEffect, useRef, useState } from 'react';
import { useFolderStore } from '../stores/folderStore';
import { useImageStore } from '../stores/imageStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useFolderScanStore } from '../stores/folderScanStore';
import { toast } from '../stores/toastStore';
import { OnboardingFeaturesStep } from './OnboardingFeaturesStep';
import { OnboardingFolderStep, type SuggestedFolder } from './OnboardingFolderStep';
import { OnboardingScanProgressPill } from './OnboardingScanProgressPill';

export function OnboardingTakeover() {
  const loaded = useOnboardingStore((s) => s.loaded);
  const completed = useOnboardingStore((s) => s.completed);
  const setCompleted = useOnboardingStore((s) => s.setCompleted);
  const markHint = useOnboardingStore((s) => s.markHint);

  const refreshFolders = useFolderStore((s) => s.load);

  const [hasImages, setHasImages] = useState<boolean | null>(null);
  const [step, setStep] = useState<'features' | 'folders'>('features');
  const [suggestion, setSuggestion] = useState<SuggestedFolder | null>(null);
  const [working, setWorking] = useState<null | 'pictures' | 'custom'>(null);
  const scanningPath = useFolderScanStore((s) => s.scanningFolder);
  const scanProgress = useFolderScanStore((s) => s.scanProgress);
  const scanFolder = useFolderScanStore((s) => s.scanFolder);
  const cancelScan = useFolderScanStore((s) => s.cancelScan);
  const refreshInFlightRef = useRef(false);

  const visible = loaded && hasImages === false && !completed;

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setHasImages(null);
    window.sortieAPI
      .getImages(1, 0)
      .then((images) => {
        if (!cancelled) setHasImages(images.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasImages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, completed]);

  useEffect(() => {
    if (!visible) return;
    window.sortieAPI
      .suggestDefaultPhotoFolder()
      .then(setSuggestion)
      .catch(() => setSuggestion(null));
  }, [visible]);

  // Pre-onboarding installs: mark done silently when they already have images.
  useEffect(() => {
    if (loaded && !completed && hasImages) {
      void setCompleted();
      void markHint('search', 'seen');
      void markHint('web', 'seen');
    }
  }, [loaded, completed, hasImages, setCompleted, markHint]);

  const kickScan = (folderPath: string) =>
    scanFolder(folderPath, {
      onMilestone: async () => {
        if (refreshInFlightRef.current) return;
        refreshInFlightRef.current = true;
        try {
          await window.sortieAPI.reshuffleImages();
          const { lastQuery, runQuery } = useImageStore.getState();
          await runQuery(lastQuery ?? {});
        } catch {
          // best-effort; pull-to-refresh remains available.
        } finally {
          refreshInFlightRef.current = false;
        }
      },
    });

  const handleAdd = async (mode: 'pictures' | 'custom') => {
    if (working) return;
    setWorking(mode);
    try {
      let target: string | null = null;
      if (mode === 'pictures') {
        target = suggestion?.path ?? null;
      } else {
        target = await window.sortieAPI.pickFolder();
      }
      if (!target) {
        setWorking(null);
        return;
      }
      await window.sortieAPI.addFolder(target);
      await refreshFolders();
      await setCompleted();
      // Un-awaited so the user watches the gallery fill in.
      void kickScan(target);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
      setWorking(null);
    }
  };

  const handleSkip = async () => {
    await setCompleted();
  };

  if (!visible) {
    // Keep the pill alive after dismissal while our scan is still running.
    if (scanningPath && scanProgress) {
      return (
        <OnboardingScanProgressPill progress={scanProgress} onCancel={() => void cancelScan()} />
      );
    }
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-cream flex items-center justify-center p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 15% 20%, rgba(201,184,232,0.35), transparent 55%), radial-gradient(circle at 85% 80%, rgba(244,168,150,0.25), transparent 55%)',
        }}
      />

      <div className="relative w-full max-w-2xl">
        {step === 'features' ? (
          <OnboardingFeaturesStep onGetStarted={() => setStep('folders')} />
        ) : (
          <OnboardingFolderStep
            suggestion={suggestion}
            working={working}
            onAdd={(mode) => void handleAdd(mode)}
            onSkip={() => void handleSkip()}
          />
        )}
      </div>
    </div>
  );
}
