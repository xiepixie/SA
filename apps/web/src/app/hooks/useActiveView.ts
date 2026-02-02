import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/useAppStore';
import type { AppState } from '../state/useAppStore';

/**
 * useActiveView: Registers a view as active in the global scheduler.
 * This enables visibility-aware revalidation: the scheduler will only
 * fetch data for views that are currently mounted and registered.
 *
 * On mount, it marks the view as stale ONLY if:
 * 1. The view has no cached data (first load), OR
 * 2. The view is already marked stale (pending update from realtime)
 *
 * This prevents unnecessary refetches when navigating between pages
 * that already have fresh data, eliminating the double-refresh flicker.
 */
export function useActiveView(viewKey: string) {
    const setActiveView = useAppStore((s: AppState) => s.setActiveView);
    const markStale = useAppStore((s: AppState) => s.markStale);
    const hasInitialized = useRef(false);

    useEffect(() => {
        // Mark as active on mount
        setActiveView(viewKey, true);

        // Check if we actually need to fetch data
        const state = useAppStore.getState();
        const isAlreadyStale = !!state.stale[viewKey];

        // Check if we have cached data for this view
        const hasCachedData = (() => {
            // v:welcome and v:dashboard share the same data source
            if (viewKey === 'v:welcome') return !!state.entities.dashboard.me;
            if (viewKey === 'v:dashboard') return !!state.entities.dashboard.me;
            if (viewKey === 'v:question_list') return Object.keys(state.entities.questions).length > 0;
            if (viewKey === 'v:due_list') return Object.keys(state.entities.cardsPulse).length > 0;
            if (viewKey === 'v:asset') return Object.keys(state.entities.assets).length > 0;
            if (viewKey === 'v:exam_list') return Object.keys(state.entities.exams).length > 0;
            return false;
        })();

        // Only trigger fetch if:
        // 1. First initialization of this hook instance (to handle StrictMode double-mount)
        // 2. AND either no cached data OR already marked stale
        if (!hasInitialized.current) {
            hasInitialized.current = true;

            if (!hasCachedData) {
                // First load: use strong to ensure data is fetched
                markStale(viewKey, 'mount', 95, { intent: 'focus', prefetch: false, strong: true });
            } else if (isAlreadyStale) {
                // Already stale (e.g., from realtime signal): just bump priority
                markStale(viewKey, 'activate', 90, { intent: 'focus', prefetch: false, strong: false });
            }
            // If we have cached data and not stale, do nothing - use existing data
        }

        return () => {
            // Unregister on unmount
            setActiveView(viewKey, false);
        };
    }, [viewKey, setActiveView, markStale]);
}
