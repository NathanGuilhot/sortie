import { ReactNode } from 'react';
import { XIcon, SpinnerIcon } from './icons';

export function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}

export interface StatItem {
  value: ReactNode;
  label: string;
}

export function StatHeader({ stats, action }: { stats: StatItem[]; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-6">
        {stats.map((stat, idx) => (
          <div key={stat.label} className="flex items-center gap-6">
            {idx > 0 && <div className="w-px h-8 bg-gray-200" />}
            <div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-500">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between text-sm">
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 hover:text-red-600 cursor-pointer"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}

export function ProgressPanel({
  label,
  current,
  total,
  currentFile,
}: {
  label: string;
  current?: number;
  total?: number;
  currentFile?: string;
}) {
  const hasTotal = typeof total === 'number' && total > 0 && typeof current === 'number';
  return (
    <div className="mb-6 p-4 bg-lavender/30 border border-lavender/50 rounded-lg">
      {hasTotal ? (
        <>
          <div className="flex justify-between text-sm text-ink mb-2">
            <span>{label}</span>
            <span>
              {current} / {total}
            </span>
          </div>
          <div className="w-full bg-lavender/50 rounded-full h-2">
            <div
              className="bg-ink h-2 rounded-full transition-all duration-300"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </div>
          {currentFile && <div className="text-xs text-ink/70 mt-1 truncate">{currentFile}</div>}
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-ink">
          <SpinnerIcon className="w-4 h-4 animate-spin" />
          {label}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  iconTone = 'default',
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  iconTone?: 'default' | 'success';
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-4">
        <div className={iconTone === 'success' ? 'text-mint' : 'text-gray-400'}>{icon}</div>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mb-6 text-center max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}

export function PrimaryButton({
  icon,
  children,
  onClick,
  disabled,
  size = 'md',
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'md' | 'lg';
}) {
  const padding = size === 'lg' ? 'px-5 py-2.5' : 'px-4 py-2.5';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 ${padding} bg-ink text-white rounded-lg hover:bg-ink/90 transition-colors text-sm font-medium cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {icon}
      {children}
    </button>
  );
}

export function CancelButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium cursor-pointer"
    >
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
      {children}
    </button>
  );
}
