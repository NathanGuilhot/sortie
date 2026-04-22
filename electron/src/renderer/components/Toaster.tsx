import { useToastStore, ToastKind } from '../stores/toastStore';
import { XIcon } from './icons';

const KIND_STYLES: Record<ToastKind, string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-mint/30 border-mint/50 text-ink',
  info: 'bg-lavender/30 border-lavender/50 text-ink',
};

const DISMISS_HOVER: Record<ToastKind, string> = {
  error: 'hover:bg-red-100 text-red-400 hover:text-red-600',
  success: 'hover:bg-mint/40 text-ink/60 hover:text-ink',
  info: 'hover:bg-lavender/40 text-ink/60 hover:text-ink',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto min-w-[260px] max-w-md px-4 py-3 border rounded-lg shadow-lg shadow-black/5 text-sm flex items-start gap-3 ${KIND_STYLES[t.kind]}`}
        >
          <span className="flex-1 break-words">{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            className={`w-6 h-6 flex items-center justify-center rounded shrink-0 cursor-pointer ${DISMISS_HOVER[t.kind]}`}
            aria-label="Dismiss"
          >
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
