import { useEffect } from 'react';

/**
 * Hook to show browser confirmation when leaving page with unsaved changes
 */
export function useBeforeUnload(shouldBlock: boolean, message?: string): void {
    useEffect(() => {
        if (!shouldBlock) return;

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Modern browsers ignore custom messages, but we set it anyway
            e.returnValue = message || 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [shouldBlock, message]);
}
