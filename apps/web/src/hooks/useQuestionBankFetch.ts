import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/eden';
import { questionKeys } from '../queries/keys';

export interface QuestionFilters {
    q?: string;
    subjectId?: string;
    type?: string;
    difficulty?: string;
    archived?: string;
    sort?: string;
    tags?: string;
}

/**
 * useQuestionBankFetch - Infinite Scroll Hook for Question Bank
 * Handles server-side pagination, filtering, and caching.
 */
export const useQuestionBankFetch = (filters: QuestionFilters) => {
    return useInfiniteQuery({
        queryKey: questionKeys.list(filters),
        queryFn: async ({ pageParam }) => {
            const { data, error } = await api.api.v1.questions.get({
                query: {
                    ...filters,
                    cursor: pageParam as string,
                    limit: 50
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
        staleTime: 1000 * 60 * 5, // 5 minutes cache
        placeholderData: (prev) => prev,
        maxPages: 10,
        select: (data) => {
            const now = new Date();
            return {
                ...data,
                pages: data.pages.map(page => ({
                    ...page,
                    items: (page.items || []).map((item: any) => {
                        const due = item.due ? new Date(item.due) : null;
                        const _isOverdue = due && due < now && item.state !== 0;
                        const _isDueToday = due && due.toDateString() === now.toDateString() && item.state !== 0;
                        const rawContent = typeof item.content === 'string' ? item.content : '';

                        return {
                            ...item,
                            _isOverdue,
                            _isDueToday,
                            contentPreview: rawContent.slice(0, 500)
                        };
                    })
                }))
            };
        }
    });
};

