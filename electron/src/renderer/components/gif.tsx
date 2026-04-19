import type { Image } from 'shared';

export function isGif(image: Pick<Image, 'mime_type' | 'file_path'>): boolean {
  if (image.mime_type === 'image/gif') return true;
  return image.file_path.toLowerCase().endsWith('.gif');
}

export function isGifUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0] ?? url;
  return path.toLowerCase().endsWith('.gif');
}

export function GifBadge({
  corner = 'bottom-right',
}: {
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}) {
  const positions: Record<string, string> = {
    'top-left': 'top-1.5 left-1.5',
    'top-right': 'top-1.5 right-1.5',
    'bottom-left': 'bottom-1.5 left-1.5',
    'bottom-right': 'bottom-1.5 right-1.5',
  };
  return (
    <div
      className={`absolute ${positions[corner]} px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white bg-black/60 backdrop-blur rounded pointer-events-none select-none`}
    >
      GIF
    </div>
  );
}
