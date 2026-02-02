/**
 * TanStack Query Key Factory
 * Centralized keys for better cache management and predictable invalidation.
 */

export const questionKeys = {
    all: ['questions'] as const,
    lists: () => [...questionKeys.all, 'list'] as const,
    list: (filters: Record<string, any>) => [...questionKeys.lists(), filters] as const,
    details: () => [...questionKeys.all, 'detail'] as const,
    detail: (id: string | null) => [...questionKeys.details(), id] as const,
};

export const subjectKeys = {
    all: ['subjects'] as const,
    list: () => [...subjectKeys.all, 'list'] as const,
};

export const tagKeys = {
    all: ['tags'] as const,
    list: () => [...tagKeys.all, 'list'] as const,
};

export const studyKeys = {
    all: ['study'] as const,
    dashboard: () => [...studyKeys.all, 'dashboard'] as const,
    dueList: (mode: string) => [...studyKeys.all, 'due-list', mode] as const,
    preview: (cardId: string) => [...studyKeys.all, 'preview', cardId] as const,
};

export const auditKeys = {
    all: ['audit'] as const,
    timeline: () => [...auditKeys.all, 'timeline'] as const,
};

export const importKeys = {
    all: ['import'] as const,
    mutations: () => [...importKeys.all, 'mutation'] as const,
};
