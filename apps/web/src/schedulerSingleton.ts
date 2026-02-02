import { QueryClient } from '@tanstack/react-query';
import { RevalidateScheduler } from './app/scheduler/scheduler';
import { v2Api } from './app/api/views';

let scheduler: RevalidateScheduler | null = null;

/**
 * Ensures a single instance of RevalidateScheduler is active.
 * Safe for HMR and React StrictMode.
 */
export function ensureScheduler(queryClient: QueryClient) {
    if (!scheduler) {
        scheduler = new RevalidateScheduler(queryClient, v2Api);
    }
    return scheduler;
}

/**
 * Disposes the active scheduler instance and clears the singleton.
 */
export function disposeScheduler() {
    if (scheduler) {
        scheduler.dispose();
        scheduler = null;
    }
}
