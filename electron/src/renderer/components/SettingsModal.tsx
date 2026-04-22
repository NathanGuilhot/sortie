import { useEffect, useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !resetting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, resetting]);

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      await window.sortieAPI.resetDatabase();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
      setResetting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60" onClick={resetting ? undefined : onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        </div>

        <div className="px-8 py-5 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900">Reset all data</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Wipes the database and cached thumbnails. Your photo files on disk are left untouched.
          </p>
          <div className="mt-4 flex items-center justify-end gap-2 min-h-[36px]">
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
              >
                Reset
              </button>
            ) : (
              <>
                <span className="mr-auto text-xs text-red-600">
                  Are you sure? This cannot be undone.
                </span>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={resetting}
                  className="px-3 py-2 text-sm text-gray-700 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleReset()}
                  disabled={resetting}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {resetting ? 'Resetting…' : 'Yes, reset everything'}
                </button>
              </>
            )}
          </div>
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>

        <div className="px-8 py-4 bg-cream flex justify-end">
          <button
            onClick={onClose}
            disabled={resetting}
            className="px-5 py-2 bg-ink text-white text-sm rounded-md hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
