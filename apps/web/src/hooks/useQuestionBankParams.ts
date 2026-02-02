import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

/**
 * useQuestionBankParams - URL Synchronization Hook
 * Syncs UI filters and selection with URL search parameters.
 */
export const useQuestionBankParams = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // 1. Read sanitized values from URL
    const filters = useMemo(() => ({
        q: searchParams.get('s') || '',
        subjectIds: searchParams.get('subs')?.split(',').filter(Boolean) || [],
        type: searchParams.get('t') || 'all',
        difficulty: searchParams.get('d') || 'all',
        status: searchParams.get('st') || 'all',
        sort: searchParams.get('sort') || 'default',
        tags: searchParams.get('tags')?.split(',').filter(Boolean) || []
    }), [searchParams]);

    const activeId = searchParams.get('id') || null;

    // 2. Update functions
    const setFilters = useCallback((updates: Partial<typeof filters>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const merged = { ...filters, ...updates };

            if (merged.q) next.set('s', merged.q); else next.delete('s');

            if (merged.subjectIds.length > 0) {
                next.set('subs', merged.subjectIds.join(','));
            } else {
                next.delete('subs');
            }

            if (merged.type !== 'all') next.set('t', merged.type); else next.delete('t');
            if (merged.difficulty !== 'all') next.set('d', merged.difficulty); else next.delete('d');
            if (merged.status !== 'all') next.set('st', merged.status); else next.delete('st');
            if (merged.sort !== 'default') next.set('sort', merged.sort); else next.delete('sort');

            if (merged.tags.length > 0) {
                next.set('tags', merged.tags.join(','));
            } else {
                next.delete('tags');
            }

            // Clear activeId when filters change to avoid showing stale question in inspector
            next.delete('id');

            return next;
        }, { replace: true });
    }, [filters, setSearchParams]);

    const setActiveId = useCallback((id: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (id) next.set('id', id); else next.delete('id');
            return next;
        }, { replace: true }); // Avoid polluting browser history on each question switch
    }, [setSearchParams]);

    return {
        filters,
        activeId,
        setFilters,
        setActiveId
    };
};
