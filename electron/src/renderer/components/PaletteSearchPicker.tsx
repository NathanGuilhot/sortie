import { useEffect, useRef, useState } from 'react';

interface PaletteSearchPickerProps {
  colors: string[];
  onChange: (colors: string[]) => void;
}

const MAX_SLOTS = 2;

const PRESETS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#000000',
  '#6b7280',
  '#ffffff',
  '#78350f',
];

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r: number;
  let g: number;
  let b: number;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to2 = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function ColorWheel({
  initialHex,
  onPick,
}: {
  initialHex: string | null;
  onPick: (hex: string) => void;
}) {
  // Lightness is a separate slider so the wheel can focus on hue + saturation.
  const [lightness, setLightness] = useState(0.5);
  const wheelRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);

  const pickFromEvent = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min(cx, cy);
    // Clamp to the wheel; saturation falls off linearly with distance.
    const clamped = Math.min(dist, radius);
    const saturation = clamped / radius;
    // atan2: 0 points right; conic-gradient starts red at the top going
    // clockwise, so rotate +90° to align the two.
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    angle = (angle + 360) % 360;
    const hex = hslToHex(angle, saturation, lightness);
    const nx = cx + (clamped * dx) / (dist || 1);
    const ny = cy + (clamped * dy) / (dist || 1);
    setMarker({ x: nx, y: ny });
    onPick(hex);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    pickFromEvent(e.clientX, e.clientY);
    const move = (evt: MouseEvent) => pickFromEvent(evt.clientX, evt.clientY);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // When lightness changes, repick at the current marker so the preview
  // reflects the new lightness without forcing the user to re-click.
  useEffect(() => {
    if (!marker || !wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    pickFromEvent(rect.left + marker.x, rect.top + marker.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightness]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div
          ref={wheelRef}
          onMouseDown={handleMouseDown}
          className="relative w-40 h-40 rounded-full cursor-crosshair select-none"
          style={{
            background: `conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)`,
          }}
        >
          {/* Saturation falloff: white center → transparent rim. */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 60%)`,
            }}
          />
          {/* Lightness overlay: darken or lighten the whole wheel based on L. */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                lightness < 0.5
                  ? `rgba(0,0,0,${(0.5 - lightness) * 1.6})`
                  : `rgba(255,255,255,${(lightness - 0.5) * 1.6})`,
            }}
          />
          {marker && (
            <div
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow pointer-events-none"
              style={{
                left: marker.x - 6,
                top: marker.y - 6,
                backgroundColor: initialHex ?? 'transparent',
              }}
            />
          )}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(lightness * 100)}
        onChange={(e) => setLightness(Number(e.target.value) / 100)}
        className="h-40 w-5"
        style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        title="Lightness"
      />
    </div>
  );
}

function ColorSlot({
  hex,
  onPick,
  onClear,
}: {
  hex: string | null;
  onPick: (hex: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (slotRef.current && !slotRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={slotRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full border border-gray-200 shadow-sm hover:scale-105 transition-transform"
        style={{
          backgroundColor: hex ?? 'transparent',
          backgroundImage: hex
            ? undefined
            : 'repeating-linear-gradient(45deg, #e5e7eb 0 4px, #f3f4f6 4px 8px)',
        }}
        title={hex ?? 'Pick a color'}
      />
      {hex && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-800 text-[9px] flex items-center justify-center shadow-sm"
          title="Clear color"
        >
          ×
        </button>
      )}
      {open && (
        <div className="absolute z-30 top-11 left-0 bg-white rounded-xl border border-gray-200 shadow-xl p-3 w-64">
          <ColorWheel initialHex={hex} onPick={onPick} />
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="w-7 h-7 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          {hex && (
            <div className="mt-3 text-center text-xs font-mono text-gray-500">
              {hex.toUpperCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaletteSearchPicker({ colors, onChange }: PaletteSearchPickerProps) {
  const slots: (string | null)[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) slots.push(colors[i] ?? null);

  const setSlot = (idx: number, hex: string | null) => {
    const next = [...slots];
    next[idx] = hex;
    onChange(next.filter((c): c is string => c !== null));
  };

  return (
    <div className="flex items-center gap-2">
      {slots.map((hex, idx) => (
        <ColorSlot
          key={idx}
          hex={hex}
          onPick={(c) => setSlot(idx, c)}
          onClear={() => setSlot(idx, null)}
        />
      ))}
      {colors.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
        >
          Clear
        </button>
      )}
    </div>
  );
}
