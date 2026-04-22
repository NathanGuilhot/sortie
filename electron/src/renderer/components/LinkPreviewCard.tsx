import { useEffect, useState } from 'react';
import type { LinkPreview } from 'shared';
import { LinkIcon, RefreshIcon } from './icons';

interface Props {
  url: string;
}

const MAX_AGE_DAYS = 30;

function isFresh(preview: LinkPreview): boolean {
  if (!preview.fetched_at) return false;
  const age = Date.now() - new Date(preview.fetched_at).getTime();
  return age < MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkPreviewCard({ url }: Props) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUrl, setLastUrl] = useState(url);

  if (url !== lastUrl) {
    setLastUrl(url);
    setPreview(null);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = await window.sortieAPI.getLinkPreview(url);
      if (cancelled) return;
      if (cached && isFresh(cached)) {
        setPreview(cached);
        setLoading(false);
        return;
      }
      if (cached) setPreview(cached);
      const fresh = await window.sortieAPI.fetchLinkPreview(url);
      if (cancelled) return;
      setPreview(fresh);
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleOpen = () => {
    void window.sortieAPI.app.openExternal(url);
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    const fresh = await window.sortieAPI.fetchLinkPreview(url);
    setPreview(fresh);
    setLoading(false);
  };

  const host = hostnameOf(preview?.url || url);

  if (loading && !preview) {
    return (
      <div className="mt-2 rounded-xl bg-gray-50/80 border border-gray-100 overflow-hidden animate-pulse">
        <div className="flex gap-3 p-3">
          <div className="w-16 h-16 rounded-lg bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!preview || preview.error) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="mt-2 w-full text-left rounded-xl bg-gray-50/80 border border-gray-100 p-3 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-700 truncate">{host}</div>
            <div className="text-xs text-gray-400 truncate">
              {preview?.error ? 'Preview unavailable' : 'Open link'}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="mt-2 relative group">
      <button
        type="button"
        onClick={handleOpen}
        className="w-full text-left rounded-xl bg-gray-50/80 border border-gray-100 overflow-hidden hover:bg-gray-100 transition-colors"
      >
        <div className="flex gap-3 p-3">
          {preview.image_path ? (
            <img
              src={`sortie-preview:///${preview.image_path}`}
              alt=""
              className="w-16 h-16 rounded-lg object-cover bg-gray-100 shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
              <LinkIcon className="w-6 h-6 text-gray-300" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 truncate">
              {preview.site_name || host}
            </div>
            <div className="text-sm font-medium text-gray-900 line-clamp-2">
              {preview.title || host}
            </div>
            {preview.description && (
              <div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{preview.description}</div>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => void handleRefresh(e)}
        title="Refresh preview"
        className="absolute top-2 right-2 p-1 rounded-md bg-white/80 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
