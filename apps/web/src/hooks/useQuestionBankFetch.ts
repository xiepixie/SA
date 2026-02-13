import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/eden';
import { questionKeys } from '../queries/keys';

export interface QuestionFilters {
    q?: string;
    subjectIds?: string;   // comma-separated subject IDs for multi-select
    type?: string;
    difficulty?: string;
    archived?: string;
    sort?: string;
    tags?: string;         // comma-separated tag names/IDs
}

/**
 * useQuestionBankFetch - Infinite Scroll Hook for Question Bank
 *
 * 🚀 V2 OPTIMIZATION: All filter conditions are now passed to the backend.
 * Previously, only q/archived/sort were sent to the server and subject/type/
 * difficulty/tags were filtered client-side. This caused:
 *   1. Over-fetching from the database
 *   2. Client-side filtering lag on large datasets
 *   3. Incorrect pagination (pages didn't reflect filtered counts)
 *
 * Now the server handles all filtering + pagination, and TanStack Query's
 * `placeholderData: (prev) => prev` keeps old data visible during transitions.
 */
export const useQuestionBankFetch = (filters: QuestionFilters) => {
    return useInfiniteQuery({
        queryKey: questionKeys.list(filters),
        queryFn: async ({ pageParam }) => {
            const { data, error } = await api.api.v1.questions.get({
                query: {
                    ...filters,
                    cursor: pageParam as string,
                    limit: 30   // Reduced from 50 for faster first paint
                }
            });

            if (error) {
                const msg = (error.value as any)?.error || 'Failed to fetch questions';
                throw new Error(msg);
            }

            return data;
        },
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => lastPage?.nextCursor || null,
        staleTime: 1000 * 60 * 5,        // 5 minutes cache
        placeholderData: (prev) => prev,  // Keep old data during filter transitions
        maxPages: 10,
        select: (data) => {
            const now = new Date();
            return {
                ...data,
                pages: data.pages.map(page => ({
                    ...page,
                    items: (page.items || []).map((item: any) => {
                        const card = item.card;
                        const due = card?.due ? new Date(card.due) : null;
                        const _isOverdue = due && due < now && card?.state !== 0;
                        const _isDueToday = due && due.toDateString() === now.toDateString() && card?.state !== 0;

                        return {
                            ...item,
                            _isOverdue,
                            _isDueToday,
                            // Use server-provided content_preview, fallback to slicing content
                            contentPreview: item.content_preview || (typeof item.content === 'string' ? item.content.slice(0, 200) : '')
                        };
                    })
                }))
            };
        }
    });
};
