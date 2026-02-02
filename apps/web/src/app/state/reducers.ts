import { useAppStore, type StoreMutation, type EntitiesState } from './useAppStore';
import type {
    UnifiedEvent,
    RealtimeTopic,
    RealtimeOp,
    UXEffect,
    PatchMode
} from '@v2/shared';
import { wmKey, shouldApply } from '@v2/shared';

/**
 * SIGNAL_RULES: Table-driven behavior for Signals
 */
type SignalRule = {
    patch: PatchMode;
    entity?: keyof EntitiesState;
    idField?: string;
    onEffect?: (ev: UnifiedEvent, currentEntity?: any) => (Omit<UXEffect, 'id'> & { id?: string; dedupeKey?: string }) | null;
    mark?: (ev: UnifiedEvent) => string[];
    priority?: number;
};

const VIEWS = {
    dueList: "v:due_list",
    questionList: "v:question_list",
    examList: "v:exam_list",
    asset: "v:asset",
    overlay: "v:card_overlay",
    dashboard: "v:dashboard",
} as const;

function uuid() {
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

const SIGNAL_RULES: Partial<Record<RealtimeTopic, Partial<Record<RealtimeOp, SignalRule>>>> = {
    job: {
        UPSERT: {
            patch: "entity_patch",
            entity: "jobsPulse",
            idField: "job_id",
            onEffect: () => ({
                type: "toast",
                level: "info",
                message: "Import job started",
                dedupeKey: "job:started",
                id: `job:start:${Date.now()}`
            }),
        },
        UPDATE: {
            patch: "entity_patch",
            entity: "jobsPulse",
            idField: "job_id",
            onEffect: (ev, current) => {
                const s = ev.payload?.status;
                const prevS = current?.status;

                // Status Machine: Only toast if status changed
                if (s === prevS) return null;

                if (s === "failed") return {
                    type: "toast", level: "error", message: "Import failed",
                    dedupeKey: "job:failed", id: `job:fail:${ev.entityKey}`
                };
                if (s === "completed") return {
                    type: "toast", level: "success", message: "Import completed",
                    dedupeKey: "job:success", id: `job:success:${ev.entityKey}`
                };
                return null;
            },
        },
        REMOVE: { patch: "tombstone_remove", entity: "jobsPulse", idField: "job_id" },
    },
    due_list: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.dueList, VIEWS.overlay, VIEWS.dashboard],
            priority: 10
        },
    },
    question_list: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.questionList],
            priority: 5
        },
        UPDATE: {
            patch: "mark_stale",
            mark: () => [VIEWS.questionList],
            priority: 5
        },
        REMOVE: {
            patch: "mark_stale",
            mark: () => [VIEWS.questionList, VIEWS.dueList],
            priority: 8
        }
    },
    exam_list: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.examList],
            priority: 5
        }
    },
    dashboard: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.dashboard],
            priority: 10
        }
    },
    asset: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.asset],
            priority: 5
        },
        ADD: {
            patch: "mark_stale",
            mark: () => [VIEWS.asset, VIEWS.questionList],
            priority: 8
        },
        UPDATE: {
            patch: "mark_stale",
            mark: () => [VIEWS.asset, VIEWS.questionList],
            priority: 8
        },
        REMOVE: {
            patch: "mark_stale",
            mark: () => [VIEWS.asset, VIEWS.questionList, VIEWS.dueList],
            priority: 10
        }
    },
    card_overlay: {
        REFRESH: {
            patch: "mark_stale",
            mark: () => [VIEWS.overlay],
            priority: 8
        }
    },
    question: {
        UPSERT: { patch: "entity_patch", entity: "questions", idField: "question_id" },
        UPDATE: {
            patch: "entity_patch",
            entity: "questions",
            idField: "question_id",
            mark: (ev) => {
                const r = ev.payload?.reason;
                if (r === "tags_changed") return [VIEWS.questionList];
                if (r === "source_updated") return [`e:question:${ev.entityKey}`];
                return [];
            }
        },
        REMOVE: {
            patch: "tombstone_remove",
            entity: "questions",
            idField: "question_id",
            mark: () => [VIEWS.questionList, VIEWS.dueList, VIEWS.dashboard],
            priority: 10
        }
    },
    card: {
        UPSERT: { patch: "entity_patch", entity: "cardsPulse", idField: "card_id" },
        UPDATE: {
            patch: "entity_patch",
            entity: "cardsPulse",
            idField: "card_id",
            mark: () => [VIEWS.dueList, VIEWS.dashboard]
        },
        REMOVE: {
            patch: "tombstone_remove",
            entity: "cardsPulse",
            idField: "card_id",
            mark: () => [VIEWS.dueList, VIEWS.dashboard],
            priority: 10
        }
    },
    exam: {
        UPSERT: { patch: "entity_patch", entity: "exams", idField: "exam_id" },
        UPDATE: { patch: "entity_patch", entity: "exams", idField: "exam_id", mark: () => [VIEWS.examList] },
        REMOVE: { patch: "tombstone_remove", entity: "exams", idField: "exam_id", mark: () => [VIEWS.examList], priority: 10 }
    }
};

/**
 * applyEvent: Unified entry for Pulse and Signal
 */
export function applyEvent(ev: UnifiedEvent) {
    const { watermark, commitBatch } = useAppStore.getState();
    const sourceKind = ev.source.kind;

    let target = ev.entityKey;
    if (ev.topic === 'dashboard') target = 'me';

    const k = wmKey(sourceKind, `${ev.topic}:${target}`);

    const wm = watermark[k];
    if (!shouldApply(wm?.at, ev.updatedAt, ev.op, wm?.seq, ev.seq)) return;

    const mutations: StoreMutation[] = [];
    mutations.push({ type: 'watermark', key: k, at: ev.updatedAt, seq: ev.seq });

    if (ev.source.kind === "pulse") {
        applyPulse(ev, mutations);
    } else {
        applySignal(ev, mutations);
    }

    if (mutations.length > 0) {
        commitBatch(mutations);
    }
}

function applySignal(ev: UnifiedEvent, mutations: StoreMutation[]) {
    const rule = SIGNAL_RULES[ev.topic]?.[ev.op];

    if (!rule) {
        if (ev.op === 'REFRESH') {
            mutations.push({
                type: 'mark_stale',
                keys: [`v:${ev.topic}`],
                reason: 'no_rule',
                priority: 0
            });
        }
        return;
    }

    // ID Fault Tolerance: Check snake_case and camelCase
    let id = ev.entityKey;
    if (rule.idField) {
        const snake = rule.idField;
        const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        id = String(ev.payload?.[snake] || ev.payload?.[camel] || ev.entityKey);
    }

    let currentEntity: any = null;
    if (rule.entity) {
        currentEntity = useAppStore.getState().entities[rule.entity][id];
    }

    if (rule.onEffect) {
        const eff = rule.onEffect(ev, currentEntity);
        if (eff) {
            mutations.push({
                type: 'push_effect',
                effect: {
                    ...eff,
                    id: eff.id || uuid(),
                    createdAt: new Date().toISOString()
                }
            });
        }
    }

    if (rule.mark) {
        mutations.push({
            type: 'mark_stale',
            keys: rule.mark(ev),
            reason: ev.payload?.reason || ev.op,
            priority: rule.priority || 0
        });
    }

    if (rule.patch === "entity_patch" || rule.patch === "tombstone_remove") {
        if (rule.entity) {
            if (rule.patch === "tombstone_remove") {
                mutations.push({ type: 'entity_remove', slice: rule.entity, id });
            } else {
                mutations.push({
                    type: 'entity_patch',
                    slice: rule.entity,
                    id,
                    patch: ev.payload,
                    updatedAt: ev.updatedAt,
                    seq: ev.seq
                });
            }
        }
    }
}

function applyPulse(ev: UnifiedEvent, mutations: StoreMutation[]) {
    if (ev.source.kind !== "pulse") return;
    const table = ev.source.table;

    let target: keyof EntitiesState | null = null;
    let id = ev.entityKey;

    if (table === "cards_sync_pulse") target = "cardsPulse";
    if (table === "import_jobs_pulse") target = "jobsPulse";
    if (table === "user_dashboard_pulse") {
        target = "dashboard";
        id = "me";
    }

    if (target) {
        mutations.push({
            type: 'entity_patch',
            slice: target,
            id,
            patch: ev.payload,
            updatedAt: ev.updatedAt,
            seq: ev.seq
        });
    }
}
