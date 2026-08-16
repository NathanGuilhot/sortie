import { useToastStore, ToastKind } from '../stores/toastStore';
import { XIcon } from './icons';

const KIND_DOT: Record<ToastKind, string> = {
  error: 'bg-red-500',
  success: 'bg-mint',
  info: 'bg-lavender',
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
          className="pointer-events-auto min-w-[260px] max-w-md px-4 py-3 bg-white border border-gray-200/60 rounded-xl shadow-xl shadow-black/10 text-ink text-sm flex items-start gap-3 animate-fade-in"
        >
          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${KIND_DOT[t.kind]}`} />
          <span className="flex-1 break-words">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.onClick();
                dismissToast(t.id);
              }}
              className="shrink-0 font-medium text-ink underline underline-offset-2 hover:no-underline cursor-pointer"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => dismissToast(t.id)}
            className="w-6 h-6 flex items-center justify-center rounded shrink-0 cursor-pointer text-ink/40 hover:text-ink hover:bg-gray-100"
            aria-label="Dismiss"
          >
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
