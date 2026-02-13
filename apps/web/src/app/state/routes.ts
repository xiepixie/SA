import type {
    EntitiesState
} from './useAppStore';
import type {
    ViewResponse
} from '@v2/shared';

export interface RevalidatePlan {
    queryKey: string[];
    minIntervalMs: number;
    priority: number;
    fetcher: (signal?: AbortSignal) => Promise<ViewResponse<any>>;
    mergeIntoEntities: (entities: EntitiesState, data: ViewResponse<any>) => void;
}

/**
 * Standardized Revalidation Routes (V5.9 camelCase Protocol)
 */
// Helper to patch if either seq is higher or updatedAt is newer
// Helper to patch if either seq is higher or updatedAt is newer
function patchIfNewer(prev: any, next: any) {
    if (!prev) return true;

    const nextSeq = typeof next?.seq === 'number' ? next.seq : undefined;
    const prevSeq = typeof prev?.seq === 'number' ? prev.seq : undefined;
    if (nextSeq !== undefined) return prevSeq === undefined ? true : nextSeq > prevSeq;

    const nextAt = next?.updatedAt ?? next?.updated_at;
    const prevAt = prev?.updatedAt ?? prev?.updated_at;
    if (nextAt && prevAt) return nextAt > prevAt;

    // No ordering info: default to patch (cheaper than JSON.stringify)
    return true;
}

/**
 * Standardized Revalidation Routes (V5.9 camelCase Protocol)
 */
export const REVALIDATE_ROUTES: Record<string, (api: any) => RevalidatePlan> = {
    // v:welcome is an alias for v:dashboard - WelcomePage depends on dashboard data
    "v:welcome": (api) => ({
        queryKey: ["v", "dashboard"],
        minIntervalMs: 2000,
        priority: 100,
        fetcher: (signal) => api.getDashboard(signal),
        mergeIntoEntities: (entities, data: any) => {
            if (data?.stats) {
                const id = "me";
                const mapped = {
                    id: "me",
                    due_count: data.stats.dueToday,
                    total_count: data.stats.total,
                    new_count: data.stats.new,
                    learning_count: data.stats.learning,
                    relearning_count: data.stats.relearning,
                    updatedAt: data.serverTime || new Date().toISOString()
                };
                if (patchIfNewer(entities.dashboard[id], mapped)) {
                    entities.dashboard[id] = { ...entities.dashboard[id], ...mapped };
                }
            }
            (data?.items || []).forEach((it: any) => {
                const id = "me";
                if (patchIfNewer(entities.dashboard[id], it)) {
                    entities.dashboard[id] = { ...entities.dashboard[id], ...it };
                }
            });
        }
    }),
    "v:dashboard": (api) => ({
        queryKey: ["v", "dashboard"],
        minIntervalMs: 2000,
        priority: 100,
        fetcher: (signal) => api.getDashboard(signal),
        mergeIntoEntities: (entities, data: any) => {
            // Handle single object response from server (stats object)
            if (data?.stats) {
                const id = "me";
                const mapped = {
                    id: "me",
                    due_count: data.stats.dueToday,
                    total_count: data.stats.total,
                    // Map other stats if needed
                    new_count: data.stats.new,
                    learning_count: data.stats.learning,
                    relearning_count: data.stats.relearning,
                    updatedAt: data.serverTime || new Date().toISOString()
                };

                if (patchIfNewer(entities.dashboard[id], mapped)) {
                    entities.dashboard[id] = { ...entities.dashboard[id], ...mapped };
                }
            }

            // Fallback for list-based response if API changes
            (data?.items || []).forEach((it: any) => {
                const id = "me";
                if (patchIfNewer(entities.dashboard[id], it)) {
                    entities.dashboard[id] = { ...entities.dashboard[id], ...it };
                }
            });
        }
    }),
    "v:due_list": (api) => ({
        queryKey: ["v", "due_list"],
        minIntervalMs: 1000,
        priority: 95,
        // Default to 'due' mode for automatic revalidation
        fetcher: (signal) => api.getDueList('due', signal),
        mergeIntoEntities: (entities, data) => {
            (data?.deletedIds || []).forEach((id: any) => delete entities.cardsPulse[String(id)]);
            (data?.items || []).forEach((it: any) => {
                const id = String(it.card_id);
                if (patchIfNewer(entities.cardsPulse[id], it)) {
                    entities.cardsPulse[id] = { ...entities.cardsPulse[id], ...it };
                }

                // Extract question data from flat card item structure
                // The API returns question fields directly on the card item (title, content, etc.)
                if (it.question_id) {
                    const qId = String(it.question_id);
                    const questionData = {
                        id: it.question_id,
                        question_id: it.question_id,
                        title: it.title,
                        content: it.content,
                        question_type: it.question_type,
                        difficulty: it.question_difficulty,
                        correct_answer: it.correct_answer,
                        correct_answer_text: it.correct_answer_text,
                        hints: it.hints,
                        explanation: it.explanation,
                        image_url: it.image_url,
                        subject_id: it.subject_id,
                        subject_name: it.subject_name,
                        subject_color: it.subject_color,
                        updatedAt: it.updatedAt,
                        seq: it.seq
                    };
                    if (patchIfNewer(entities.questions[qId], questionData)) {
                        entities.questions[qId] = { ...entities.questions[qId], ...questionData };
                    }
                }
            });
        }
    }),
    "v:question_list": (api) => ({
        queryKey: ["v", "question_list"],
        minIntervalMs: 5000,
        priority: 70,
        fetcher: (signal) => api.getQuestionList(signal),
        mergeIntoEntities: (entities, data) => {
            (data?.deletedIds || []).forEach((id: any) => delete entities.questions[String(id)]);
            (data?.items || []).forEach((it: any) => {
                const id = String(it.question_id);
                if (patchIfNewer(entities.questions[id], it)) {
                    entities.questions[id] = { ...entities.questions[id], ...it };
                }

                // If card data is present, also bridge it into cardsPulse
                if (it.card) {
                    const cid = String(it.card.id);
                    if (patchIfNewer(entities.cardsPulse[cid], it.card)) {
                        entities.cardsPulse[cid] = { ...entities.cardsPulse[cid], ...it.card };
                    }
                }
            });
        }
    }),
    "v:exam_list": (api) => ({
        queryKey: ["v", "exam_list"],
        minIntervalMs: 5000,
        priority: 60,
        fetcher: (signal) => api.getQuestionList(signal), // mockup
        mergeIntoEntities: (entities, data) => {
            (data?.deletedIds || []).forEach((id: any) => delete entities.exams[String(id)]);
            (data?.items || []).forEach((it: any) => {
                const id = String(it.exam_id || it.id);
                if (patchIfNewer(entities.exams[id], it)) {
                    entities.exams[id] = { ...entities.exams[id], ...it };
                }
            });
        }
    }),
    "v:asset": (api) => ({
        queryKey: ["v", "asset"],
        minIntervalMs: 10000,
        priority: 50,
        fetcher: (signal) => api.getAssets(signal),
        mergeIntoEntities: (entities, data) => {
            (data?.deletedIds || []).forEach((id: any) => delete entities.assets[String(id)]);
            (data?.items || []).forEach((it: any) => {
                const id = String(it.id);
                if (patchIfNewer(entities.assets[id], it)) {
                    entities.assets[id] = { ...entities.assets[id], ...it };
                }
            });
        }
    }),
    "v:manage_subjects": (api) => ({
        queryKey: ["v", "manage", "subjects"],
        minIntervalMs: 5000,
        priority: 60,
        fetcher: (signal) => api.getManageSubjects(signal),
        mergeIntoEntities: (entities, data) => {
            // No specific slice for manage, we can just use entities.assets or a new one
            // But subjects are already in assets. Let's merge them there too if they follow the same structure.
            (data?.items || []).forEach((it: any) => {
                const id = String(it.id);
                if (patchIfNewer(entities.assets[id], it)) {
                    entities.assets[id] = { ...entities.assets[id], ...it, type: 'subject' };
                }
            });
        }
    }),
    "v:manage_tags": (api) => ({
        queryKey: ["v", "manage", "tags"],
        minIntervalMs: 5000,
        priority: 60,
        fetcher: (signal) => api.getManageTags(signal),
        mergeIntoEntities: (entities, data) => {
            (data?.items || []).forEach((it: any) => {
                const id = String(it.id);
                if (patchIfNewer(entities.assets[id], it)) {
                    entities.assets[id] = { ...entities.assets[id], ...it, type: 'tag' };
                }
            });
        }
    }),
    "v:manage_audit": (api) => ({
        queryKey: ["v", "manage", "audit"],
        minIntervalMs: 10000,
        priority: 40,
        fetcher: (signal) => api.getManageAudit(signal),
        mergeIntoEntities: (entities, data) => {
            // Pulse logs or similar? Let's use a temporary slice in dashboard or similar
            entities.dashboard = entities.dashboard || {};
            entities.dashboard.auditLogs = data?.items || [];
        }
    }),
    "v:note_list": (api) => ({
        queryKey: ["v", "notes"],
        minIntervalMs: 10000,
        priority: 50,
        fetcher: (signal) => api.getNotes?.(signal) || Promise.resolve({ items: [] }),
        mergeIntoEntities: (entities: any, data) => {
            entities.notes = entities.notes || {};
            (data?.items || []).forEach((it: any) => {
                const id = String(it.id);
                if (patchIfNewer(entities.notes[id], it)) {
                    entities.notes[id] = { ...entities.notes[id], ...it };
                }
            });
        }
    })
};
