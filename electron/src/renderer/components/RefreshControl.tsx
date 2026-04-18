import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useImageStore } from '../stores/imageStore';
import { useUIStore } from '../stores/uiStore';
import { toast } from '../stores/toastStore';

interface RefreshControlProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

// Overscroll distance (accumulated wheel delta above scrollTop=0) required to
// fire a reshuffle via pull-to-refresh. Deliberately high so a casual flick at
// the top of the list doesn't trigger.
const PULL_THRESHOLD = 160;
// Cap so the indicator doesn't stretch forever on aggressive scrolls.
const MAX_PULL = 220;
// Wheel-end debounce — no events for this long counts as release.
const RELEASE_DELAY_MS = 160;
// Required quiet time at the top before we accept a new pull. Blocks momentum
// scroll-up from a prior downward scroll: trackpad momentum keeps emitting
// wheel events after the user lifts their fingers, and those would otherwise
// be counted as an intentional pull the moment scrollTop hits 0.
const REST_DELAY_MS = 320;
// Don't show the indicator for tiny overscrolls — avoids flicker on stray
// single-tick wheel events.
const INDICATOR_SHOW_AT = 16;

export function RefreshControl({ scrollContainerRef }: RefreshControlProps) {
  const activeSearchQuery = useImageStore((s) => s.activeSearchQuery);
  const fetchImages = useImageStore((s) => s.fetchImages);
  const fetchFavorites = useImageStore((s) => s.fetchFavorites);
  const filterByTags = useImageStore((s) => s.filterByTags);
  const filterByPerson = useImageStore((s) => s.filterByPerson);
  const showFavoritesOnly = useUIStore((s) => s.showFavoritesOnly);
  const tagFilters = useUIStore((s) => s.tagFilters);
  const personFilter = useUIStore((s) => s.personFilter);

  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);

  // Semantic search has its own relevance-based order — the reshuffle control
  // is meaningless there.
  const disabled = !!activeSearchQuery;

  const triggerRefresh = useCallback(async () => {
    if (disabled || refreshing) return;
    setRefreshing(true);
    try {
      await window.sortieAPI.reshuffleImages();
      if (personFilter !== null) {
        await filterByPerson(personFilter);
      } else if (showFavoritesOnly) {
        await fetchFavorites();
      } else if (tagFilters.length > 0) {
        await filterByTags(tagFilters);
      } else {
        await fetchImages();
      }
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to reshuffle: ${message}`);
    } finally {
      setRefreshing(false);
    }
  }, [
    disabled,
    refreshing,
    personFilter,
    showFavoritesOnly,
    tagFilters,
    filterByPerson,
    fetchFavorites,
    filterByTags,
    fetchImages,
    scrollContainerRef,
  ]);

  // Pull-to-refresh via wheel overscroll while the container is already at
  // the top. A pull only engages if the user was *at rest* at the top before
  // the pull began — otherwise trackpad momentum from a preceding upward
  // scroll would get counted as a deliberate pull the instant scrollTop hits
  // 0. Once a session starts, subsequent wheel events add to the pull; a
  // release (no wheel activity for RELEASE_DELAY_MS) commits or cancels.
  useEffect(() => {
    if (disabled) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    let restTimer: ReturnType<typeof setTimeout> | null = null;
    // Seed optimistically: if the gallery mounts already at the top and the
    // user hasn't interacted, they're at rest.
    let restedAtTop = el.scrollTop === 0;
    let inPullSession = false;

    const resetPull = () => {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      inPullSession = false;
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = null;
      }
    };

    const armRestAfterQuiet = () => {
      if (restTimer) clearTimeout(restTimer);
      restTimer = setTimeout(() => {
        if (el.scrollTop === 0) restedAtTop = true;
      }, REST_DELAY_MS);
    };

    const handleWheel = (e: WheelEvent) => {
      // Capture pre-event rest state, then invalidate it for this event — any
      // wheel activity counts as "not at rest" until the quiet timer re-arms.
      const wasResting = restedAtTop;
      restedAtTop = false;
      armRestAfterQuiet();

      // Not at the top, or scrolling down → not a pull.
      if (el.scrollTop > 0 || e.deltaY >= 0) {
        if (pullDistanceRef.current !== 0) resetPull();
        return;
      }

      // Upward wheel at scrollTop === 0. Only start a fresh session if the
      // user had been resting; this filters out momentum overshoot from a
      // preceding upward scroll that carried them to the top.
      if (!inPullSession && !wasResting) return;
      inPullSession = true;

      const next = Math.min(MAX_PULL, pullDistanceRef.current + -e.deltaY);
      pullDistanceRef.current = next;
      setPullDistance(next);

      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        const armed = pullDistanceRef.current >= PULL_THRESHOLD;
        resetPull();
        if (armed) void triggerRefresh();
      }, RELEASE_DELAY_MS);
    };

    const handleScroll = () => {
      if (el.scrollTop > 0) {
        restedAtTop = false;
        if (inPullSession) resetPull();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    el.addEventListener('scroll', handleScroll, { passive: true });
    if (el.scrollTop === 0) armRestAfterQuiet();

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('scroll', handleScroll);
      if (releaseTimer) clearTimeout(releaseTimer);
      if (restTimer) clearTimeout(restTimer);
    };
  }, [scrollContainerRef, triggerRefresh, disabled]);

  if (disabled) return null;

  const armed = pullDistance >= PULL_THRESHOLD;
  const indicatorVisible = refreshing || pullDistance >= INDICATOR_SHOW_AT;
  const indicatorOpacity = refreshing ? 1 : Math.min(1, pullDistance / PULL_THRESHOLD);
  const indicatorTranslateY = refreshing ? 0 : Math.min(pullDistance, MAX_PULL) - MAX_PULL / 2;

  return (
    <>
      {/* Pull-to-refresh indicator — floats below the search bar */}
      {indicatorVisible && (
        <div
          className="fixed left-1/2 -translate-x-1/2 top-20 z-20 pointer-events-none"
          style={{
            opacity: indicatorOpacity,
            transform: `translate(-50%, ${indicatorTranslateY}px)`,
            transition: refreshing ? 'opacity 120ms ease-out' : 'none',
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-lg border border-gray-200/60 shadow text-xs text-gray-600">
            {refreshing ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-gray-300 border-t-gray-600" />
                <span>Reshuffling…</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5 transition-transform"
                  style={{ transform: `rotate(${armed ? 180 : pullDistance * 2}deg)` }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                <span>{armed ? 'Release to reshuffle' : 'Pull to reshuffle'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Refresh button — top-right floating */}
      <button
        onClick={() => void triggerRefresh()}
        disabled={refreshing}
        title="Reshuffle gallery"
        className={`fixed top-4 right-4 z-20 flex items-center justify-center h-11 w-11 rounded-2xl border transition-all duration-200 ${
          refreshing
            ? 'bg-white shadow-xl border-gray-300'
            : 'bg-white/80 backdrop-blur-lg shadow-lg shadow-black/5 border-gray-200/60 hover:bg-white hover:shadow-xl'
        } disabled:cursor-not-allowed cursor-pointer`}
      >
        <svg
          className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </>
  );
}
