import { useState } from 'react';
import { PaletteColor } from 'shared';
import { toast } from '../stores/toastStore';

interface PaletteRowProps {
  palette: PaletteColor[];
}

export function PaletteRow({ palette }: PaletteRowProps) {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const handleCopy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      toast.success(`Copied ${hex.toUpperCase()}`);
      setTimeout(() => {
        setCopiedHex((prev) => (prev === hex ? null : prev));
      }, 1200);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {palette.map((color, idx) => {
        const isCopied = copiedHex === color.hex;
        const hexLabel = color.hex.toUpperCase();
        return (
          <button
            key={`${color.hex}-${idx}`}
            type="button"
            onClick={() => void handleCopy(color.hex)}
            className="group relative w-8 h-8 rounded-full border border-gray-200 hover:scale-110 transition-transform duration-150 shadow-sm"
            style={{ backgroundColor: color.hex }}
            title={`${hexLabel} · ${Math.round(color.weight * 100)}%`}
          >
            <span
              className={`absolute inset-0 flex items-center justify-center rounded-full text-[9px] font-medium transition-opacity duration-150 ${
                isCopied ? 'opacity-100 bg-black/40 text-white' : 'opacity-0'
              }`}
            >
              ✓
            </span>
          </button>
        );
      })}
    </div>
  );
}
