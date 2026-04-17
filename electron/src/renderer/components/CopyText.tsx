import { useState, useRef, useCallback } from 'react';

interface CopyTextProps {
  value?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function CopyText({ value, children, className, title }: CopyTextProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const spanRef = useRef<HTMLSpanElement>(null);

  const handleCopy = useCallback(() => {
    const text = value ?? spanRef.current?.textContent ?? '';
    if (!text) return;

    void navigator.clipboard.writeText(text).then(() => {
      clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCopy();
      }
    },
    [handleCopy],
  );

  return (
    <span
      ref={spanRef}
      className={`cursor-copy select-none ${className ?? ''}`}
      title={title}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {copied ? <span className="text-green-500">Copied</span> : children}
    </span>
  );
}
