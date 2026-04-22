import { useEffect, useRef, useState } from 'react';
import { useFolderStore } from '../stores/folderStore';
import { useImageStore } from '../stores/imageStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import { toast } from '../stores/toastStore';
import { OnboardingFeaturesStep } from './OnboardingFeaturesStep';
import { OnboardingFolderStep, type SuggestedFolder } from './OnboardingFolderStep';
import { OnboardingScanProgressPill } from './OnboardingScanProgressPill';

export function OnboardingTakeover() {
  const loaded = useOnboardingStore((s) => s.loaded);
  const completed = useOnboardingStore((s) => s.completed);
  const setCompleted = useOnboardingStore((s) => s.setCompleted);
  const markHint = useOnboardingStore((s) => s.markHint);

  const folders = useFolderStore((s) => s.folders);
  const foldersLoaded = useFolderStore((s) => s.loaded);
  const refreshFolders = useFolderStore((s) => s.load);

  const [step, setStep] = useState<'features' | 'folders'>('features');
  const [suggestion, setSuggestion] = useState<SuggestedFolder | null>(null);
  const [working, setWorking] = useState<null | 'pictures' | 'custom'>(null);
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [scanningPath, setScanningPath] = useState<string | null>(null);
  const [scanOpId, setScanOpId] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const visible = loaded && foldersLoaded && folders.length === 0 && !completed;

  useEffect(() => {
    if (!visible) return;
    window.sortieAPI
      .suggestDefaultPhotoFolder()
      .then(setSuggestion)
      .catch(() => setSuggestion(null));
  }, [visible]);

  // Pre-onboarding installs: mark done silently so they don't see a takeover.
  useEffect(() => {
    if (loaded && foldersLoaded && !completed && folders.length > 0) {
      void setCompleted();
      void markHint('search', 'seen');
      void markHint('web', 'seen');
    }
  }, [loaded, foldersLoaded, completed, folders.length, setCompleted, markHint]);

  const kickScan = async (folderPath: string) => {
    const opId = crypto.randomUUID();
    setScanningPath(folderPath);
    setScanOpId(opId);
    setScanProgress(null);
    const unsubscribe = window.sortieAPI.onScanProgress((p) => {
      setScanProgress(p);
      const isMilestone = p.current > 0 && (p.current % 100 === 0 || p.current === p.total);
      if (isMilestone && !refreshInFlightRef.current) {
        refreshInFlightRef.current = true;
        void (async () => {
          try {
            await window.sortieAPI.reshuffleImages();
            const { lastQuery, runQuery } = useImageStore.getState();
            await runQuery(lastQuery ?? {});
          } catch {
            // best-effort; pull-to-refresh remains available.
          } finally {
            refreshInFlightRef.current = false;
          }
        })();
      }
    });
    try {
      await window.sortieAPI.scanFolder(folderPath, opId);
    } finally {
      unsubscribe();
      setScanProgress(null);
      setScanningPath(null);
      setScanOpId(null);
    }
  };

  const handleCancelScan = async () => {
    if (!scanOpId) return;
    try {
      await window.sortieAPI.cancelOperation(scanOpId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    }
  };

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
      void kickScan(target).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(message);
      });
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
        <OnboardingScanProgressPill
          progress={scanProgress}
          onCancel={() => void handleCancelScan()}
        />
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
