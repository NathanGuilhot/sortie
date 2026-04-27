import { useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';

export function MetadataDisclosureSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-50/80 rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider hover:text-gray-500 transition-colors"
      >
        {title}
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function CopyImageButton({
  filePath,
  label,
  className,
}: {
  filePath: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = () => {
    void window.sortieAPI.copyImageToClipboard(filePath).then((result) => {
      if (!result.success) return;
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span
      className={`cursor-copy select-none ${className ?? ''}`}
      title="Click to copy image"
      onClick={handleCopy}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCopy();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {copied ? <span className="text-green-500">Copied</span> : label}
    </span>
  );
}
