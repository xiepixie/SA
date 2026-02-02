import type { ViewResponse } from '@v2/shared';
import { api } from '../../lib/eden';

// --- Base Asset Types ---
export interface Subject {
    id: string;
    name: string;
    color: string;
    type: 'subject';
    questionCount: number;
    cardCount: number;
    updatedAt: string;
}

export interface Tag {
    id: string;
    name: string;
    color: string;
    type: 'tag';
    nodeCount: number;
    updatedAt: string;
}

export interface AuditLog {
    id: string;
    action: string;
    target: string;
    user: string;
    time: string;
    undoable: boolean;
}

// Type-safe API adapter for V2 views using Eden Treaty
export const v2Api = {
    getDashboard: async (signal?: AbortSignal): Promise<ViewResponse<any>> => {
        const { data, error, status } = await api.api.v1.dashboard.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch dashboard';
            console.error(`[API] getDashboard failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<any>;
    },

    getDueList: async (mode: 'due' | 'upcoming' | 'all' = 'due', signal?: AbortSignal): Promise<ViewResponse<any>> => {
        const { data, error, status } = await api.api.v1['due-list'].get({
            query: { mode },
            fetch: { signal }
        });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch due list';
            console.error(`[API] getDueList failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<any>;
    },

    getQuestionList: async (signal?: AbortSignal): Promise<ViewResponse<any>> => {
        const { data, error, status } = await api.api.v1.questions.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch question list';
            console.error(`[API] getQuestionList failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<any>;
    },

    getAssets: async (signal?: AbortSignal): Promise<ViewResponse<any>> => {
        const { data, error, status } = await api.api.v1.manage.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch assets';
            console.error(`[API] getAssets failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<any>;
    },
    updateQuestion: async (id: string, patch: any): Promise<any> => {
        const { data, error, status } = await api.api.v1.questions({ id }).patch(patch);
        if (error) {
            const msg = (error.value as any)?.error || (error.value as any)?.message || 'Failed to update question';
            console.error(`[API] updateQuestion failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data;
    },
    bulkUpdateQuestions: async (ids: string[], update: any): Promise<any> => {
        const { data, error, status } = await api.api.v1.questions.bulk.patch({ ids, update });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to bulk update questions';
            console.error(`[API] bulkUpdateQuestions failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data;
    },
    bulkDeleteQuestions: async (ids: string[]): Promise<any> => {
        const { data, error, status } = await api.api.v1.questions.bulk.delete({ ids });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to bulk delete questions';
            console.error(`[API] bulkDeleteQuestions failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data;
    },

    deleteQuestion: async (id: string): Promise<any> => {
        const { data, error, status } = await api.api.v1.questions({ id }).delete();

        if (error) {
            const msg = (error.value as any)?.error || (error.value as any)?.message || 'Failed to delete question';
            console.error(`[API] deleteQuestion failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data;
    },
    importQuestions: async (params: { userId: string, items: any[], config?: any }): Promise<any> => {
        const { data, error, status } = await api.api.v1.import.post(params);
        if (error) {
            const msg = (error.value as any)?.error || (error.value as any)?.message || 'Failed to import questions';
            console.error(`[API] importQuestions failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data;
    },

    /**
     * Preview next intervals for all ratings before submitting a review
     * Used to show the rating buttons with predicted intervals
     */
    previewReview: async (params: {
        card_id: string;
        stability: number;
        difficulty: number;
        days_elapsed: number;
        subject_id?: string;
    }): Promise<{
        success: boolean;
        card_id: string;
        intervals: { again: number; hard: number; good: number; easy: number };
        states: any;
        retrievability: number;
        config: { retention_target: number; has_custom_weights: boolean; subject_id: string | null; is_inherited: boolean };
    }> => {
        const { data, error, status } = await api.api.v1.review.preview.post(params);
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to preview review';
            console.error(`[API] previewReview failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as any;
    },

    /**
     * Submit a review rating - calculates next state using FSRS and persists to database
     * This is the main entry point for completing a card review
     */
    submitReview: async (params: {
        card_id: string;
        rating: 1 | 2 | 3 | 4;
        stability: number;
        difficulty: number;
        days_elapsed: number;
        duration_ms?: number;
        client_request_id?: string;
        subject_id?: string;
    }): Promise<{
        success: boolean;
        card_id: string;
        rating: number;
        new_state: {
            state: number;
            stability: number;
            difficulty: number;
            due: string;
            interval: number;
            scheduled_days: number;
        };
        retrievability: number;
        idempotent: boolean;
        all_states: any;
    }> => {
        const { data, error, status } = await api.api.v1.review.submit.post(params);
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to submit review';
            console.error(`[API] submitReview failed (${status}):`, error.value || error);
            throw new Error(msg);
        }
        return data as any;
    },
    getManageSubjects: async (signal?: AbortSignal): Promise<ViewResponse<Subject>> => {
        const { data, error } = await api.api.v1.manage.subjects.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch manage subjects';
            console.error('[API] getManageSubjects failed:', error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<Subject>;
    },
    getManageTags: async (signal?: AbortSignal): Promise<ViewResponse<Tag>> => {
        const { data, error } = await api.api.v1.manage.tags.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch manage tags';
            console.error('[API] getManageTags failed:', error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<Tag>;
    },
    getManageAudit: async (signal?: AbortSignal): Promise<ViewResponse<AuditLog>> => {
        const { data, error } = await api.api.v1.manage.audit.timeline.get({ fetch: { signal } });
        if (error) {
            const msg = (error.value as any)?.error || 'Failed to fetch manage audit';
            console.error('[API] getManageAudit failed:', error.value || error);
            throw new Error(msg);
        }
        return data as unknown as ViewResponse<AuditLog>;
    },

    // --- Asset CRUD ---
    createSubject: async (params: { name: string, color: string }): Promise<Subject> => {
        const { data, error } = await api.api.v1.manage.subjects.post(params);
        if (error) throw new Error((error.value as any)?.error || 'Failed to create subject');
        return data as unknown as Subject;
    },
    updateSubject: async (id: string, params: { name: string, color: string }): Promise<Subject> => {
        const { data, error } = await api.api.v1.manage.subjects({ id }).patch(params);
        if (error) throw new Error((error.value as any)?.error || 'Failed to update subject');
        return data as unknown as Subject;
    },
    deleteSubject: async (id: string): Promise<{ success: boolean }> => {
        const { data, error } = await api.api.v1.manage.subjects({ id }).delete();
        if (error) throw new Error((error.value as any)?.error || 'Failed to delete subject');
        return data as { success: boolean };
    },

    createTag: async (params: { name: string, color: string }): Promise<Tag> => {
        const { data, error } = await api.api.v1.manage.tags.post(params);
        if (error) throw new Error((error.value as any)?.error || 'Failed to create tag');
        return data as unknown as Tag;
    },
    updateTag: async (id: string, params: { name: string, color: string }): Promise<Tag> => {
        const { data, error } = await api.api.v1.manage.tags({ id }).patch(params);
        if (error) throw new Error((error.value as any)?.error || 'Failed to update tag');
        return data as unknown as Tag;
    },
    deleteTag: async (id: string): Promise<{ success: boolean }> => {
        const { data, error } = await api.api.v1.manage.tags({ id }).delete();
        if (error) throw new Error((error.value as any)?.error || 'Failed to delete tag');
        return data as { success: boolean };
    },
    mergeSubject: async (sourceId: string, targetId: string): Promise<{ success: boolean }> => {
        const { data, error } = await api.api.v1.manage.subjects.merge.post({ sourceId, targetId });
        if (error) throw new Error((error.value as any)?.error || 'Failed to merge subjects');
        return data as { success: boolean };
    },
    mergeTag: async (sourceId: string, targetId: string): Promise<{ success: boolean }> => {
        const { data, error } = await api.api.v1.manage.tags.merge.post({ sourceId, targetId });
        if (error) throw new Error((error.value as any)?.error || 'Failed to merge tags');
        return data as { success: boolean };
    },

    /**
     * Undo a reversible audit event
     * Restores the previous state based on stored payload
     */
    undoAuditEvent: async (eventId: string): Promise<{ success: boolean; revertedEventId: string }> => {
        const { data, error } = await api.api.v1.manage.audit.undo({ id: eventId }).post({});
        if (error) throw new Error((error.value as any)?.error || 'Failed to undo action');
        return data as { success: boolean; revertedEventId: string };
    },

};
