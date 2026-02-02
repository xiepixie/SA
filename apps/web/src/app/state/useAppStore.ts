import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { WatermarkKey, UXEffect } from '@v2/shared';

export interface EntitiesState {
    cardsPulse: Record<string, any>;
    jobsPulse: Record<string, any>;
    dashboard: Record<string, any>; // "me"
    questions: Record<string, any>;
    exams: Record<string, any>;
    assets: Record<string, any>;
}

export interface ImportTask {
    id: string;
    status: 'pending' | 'success' | 'partial' | 'failed';
    progress: number;
    total: number;
    successCount: number;
    failedCount: number;
    result?: any; // ImportPipelineResult
    error?: string;
    createdAt: string;
    title?: string;
}

const initialEntities: EntitiesState = {
    cardsPulse: {},
    jobsPulse: {},
    dashboard: {},
    questions: {},
    exams: {},
    assets: {},
};

type WatermarkTuple = { at: string; seq: number };
export type StaleEntry = {
    markedAt: number;
    reason?: string;
    priority?: number;
    prefetch?: boolean;
    intent?: 'signal' | 'heartbeat' | 'hover' | 'focus' | 'tap' | 'click' | 'manual';
    expiresAt?: number;
    strong?: boolean;
};

export type StoreMutation =
    | { type: 'watermark'; key: WatermarkKey; at: string; seq: number }
    | { type: 'entity_patch'; slice: keyof EntitiesState; id: string; patch: any; updatedAt: string; seq: number }
    | { type: 'entity_remove'; slice: keyof EntitiesState; id: string }
    | { type: 'mark_stale'; keys: string[]; reason?: string; priority?: number; prefetch?: boolean; opts?: any }
    | { type: 'push_effect'; effect: Omit<UXEffect, 'id'> & { id?: string; dedupeKey?: string } }
    | { type: 'dismiss_effect'; id: string };

function uuid() {
    // 浏览器基本都有 randomUUID；SSR/测试环境兜底
    return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function effectDedupeKey(e: any) {
    // 你也可以让 reducers/业务侧传 dedupeKey
    return e.dedupeKey ?? `${e.type}:${e.level}:${e.message}`;
}

export interface AppState {
    entities: EntitiesState;

    // watermark: absolute ordering guard
    watermark: Record<WatermarkKey, WatermarkTuple>;

    // 建议：stale 只存 v:*（view key）；e:*（entity）最好另做 flags。
    stale: Record<string, StaleEntry>;

    // toast / ux effects queue
    effects: UXEffect[];

    // Background Import Tasks
    importTasks: Record<string, ImportTask>;

    // Active views for visibility-aware revalidation
    activeViews: Record<string, boolean>;

    // Note settings (color, etc.) keyed by questionId or 'global'
    noteSettings: Record<string, { color: string; isPoppedOut?: boolean }>;

    // UI State for Review Session
    reviewUi: {
        queueWidth: number;
        notesWidth: number;
        isQueueCollapsed: boolean;
        isNotesCollapsed: boolean;
    };

    // Actions
    markStale: (key: string, reason?: string, priority?: number, opts?: { prefetch?: boolean; intent?: string; expiresAt?: number; strong?: boolean }) => void;
    clearStale: (key: string) => void;

    setWatermark: (key: WatermarkKey, at: string, seq: number) => void;

    pushEffect: (effect: Omit<UXEffect, 'id'> & { id?: string; dedupeKey?: string }) => void;
    dismissEffect: (id: string) => void;
    popEffect: () => UXEffect | undefined;

    addImportTask: (task: Omit<ImportTask, 'id' | 'status' | 'progress' | 'createdAt' | 'successCount' | 'failedCount'>) => string;
    updateImportTask: (id: string, patch: Partial<ImportTask>) => void;

    setActiveView: (viewKey: string, active: boolean) => void;
    setNoteSetting: (id: string, patch: Partial<{ color: string; isPoppedOut: boolean }>) => void;
    updateReviewUi: (patch: Partial<AppState['reviewUi']>) => void;

    // ✅ New: single-transaction commit helpers (for realtime pipeline)
    commit: (m: StoreMutation) => void;
    commitBatch: (ms: StoreMutation[]) => void;
}

export const useAppStore = create<AppState>()(
    subscribeWithSelector((set, get) => ({
        entities: initialEntities,
        watermark: {},
        stale: {},
        effects: [],
        importTasks: {},
        activeViews: {},
        noteSettings: {},
        reviewUi: {
            queueWidth: 320,
            notesWidth: 480,
            isQueueCollapsed: false,
            isNotesCollapsed: false,
        },

        // -----------------------------
        // stale: priority + anti-churn + intent semantics
        // -----------------------------
        markStale: (key, reason = 'manual', priority = 0, opts: any = {}) =>
            set((state) => {
                const prev = state.stale[key];
                const now = Date.now();

                const intent =
                    opts.intent ??
                    (opts.prefetch ? 'hover' : reason === 'heartbeat' ? 'heartbeat' : 'manual');

                // prefetch 默认 10s 过期（hover/focus）
                const prefetch = !!opts.prefetch;
                const expiresAt =
                    opts.expiresAt ??
                    (prefetch && (intent === 'hover' || intent === 'focus') ? now + 10_000 : undefined);

                // 强意图：tap/click（scheduler 可用它来决定是否 abort inflight）
                const strong = !!opts.strong || intent === 'tap' || intent === 'click';

                // 1) 如果已有更高优先级 stale，低优先级不覆盖（除非是 strong 覆盖）
                const prevPr = prev?.priority ?? 0;
                if (prev && prevPr > priority && !strong) return state;

                // 2) 200ms anti-churn：同 priority + 同 prefetch + 非 strong，跳过
                if (
                    prev &&
                    (prev.priority ?? 0) === priority &&
                    !!prev.prefetch === prefetch &&
                    !strong &&
                    now - prev.markedAt < 200
                ) {
                    return state;
                }

                // 3) 关键：避免 hover 反复刷新 markedAt 抢占队列
                // - 当 prev 已经是 prefetch 且本次还是 prefetch，且 priority 没提升：不更新时间戳
                // - 当 intent 是 hover/focus：只允许 “升级”（priority 提升/从非prefetch->prefetch/strong）才更新时间戳
                const isSoftPrefetch = prefetch && (intent === 'hover' || intent === 'focus');
                const priorityUp = !prev || priority > (prev.priority ?? 0);
                const prefetchUp = !prev || (!!prev.prefetch === false && prefetch === true);

                let markedAt = now;

                if (prev && isSoftPrefetch && !priorityUp && !prefetchUp && !strong) {
                    // 保留旧 markedAt，避免把队列顶到最前
                    markedAt = prev.markedAt;
                }

                // 4) 合并：如果已经有 expiresAt，新的 expiresAt 取更晚的（延长预测窗口）
                const nextExpiresAt =
                    expiresAt === undefined
                        ? prev?.expiresAt
                        : Math.max(prev?.expiresAt ?? 0, expiresAt);

                return {
                    stale: {
                        ...state.stale,
                        [key]: {
                            markedAt,
                            reason,
                            priority,
                            prefetch,
                            intent,
                            expiresAt: nextExpiresAt,
                            strong,
                        },
                    },
                };
            }),

        clearStale: (key) =>
            set((state) => {
                if (!state.stale[key]) return state;
                const next = { ...state.stale };
                delete next[key];
                return { stale: next };
            }),

        // -----------------------------
        // watermark: simple setter
        // -----------------------------
        setWatermark: (key, at, seq) =>
            set((state) => ({
                watermark: { ...state.watermark, [key]: { at, seq } },
            })),

        // -----------------------------
        // effects: dedupe + max length
        // -----------------------------
        pushEffect: (effect) =>
            set((state) => {
                const id = effect.id || uuid();
                const createdAt = (effect as any).createdAt || new Date().toISOString();

                const k = effectDedupeKey(effect);
                // dedupe: 同类提示 1.5s 内只保留一个（多 tab / catch-up 防轰炸）
                const now = Date.now();
                const existingIdx = state.effects.findIndex((e: any) => effectDedupeKey(e) === k);
                let next = state.effects;

                if (existingIdx !== -1) {
                    const ex: any = state.effects[existingIdx];
                    const exAt = ex.createdAt ? Date.parse(ex.createdAt) : 0;
                    if (exAt && now - exAt < 1500) {
                        // replace (refresh timestamp) instead of append
                        next = state.effects.slice();
                        next[existingIdx] = { ...ex, ...effect, id: ex.id, createdAt };
                    } else {
                        next = [...state.effects, { ...effect, id, createdAt } as UXEffect];
                    }
                } else {
                    next = [...state.effects, { ...effect, id, createdAt } as UXEffect];
                }

                // max length cap
                const MAX = 5;
                if (next.length > MAX) next = next.slice(next.length - MAX);

                return { effects: next };
            }),

        dismissEffect: (id) =>
            set((state) => {
                if (!state.effects.some((e) => e.id === id)) return state;
                return { effects: state.effects.filter((e) => e.id !== id) };
            }),

        popEffect: () => {
            const first = get().effects[0];
            if (!first) return undefined;
            set((state) => ({ effects: state.effects.slice(1) }));
            return first;
        },

        // -----------------------------
        // active views
        // -----------------------------
        setActiveView: (viewKey, active) =>
            set((state) => ({
                activeViews: { ...state.activeViews, [viewKey]: active },
            })),

        setNoteSetting: (id, patch) =>
            set((state) => ({
                noteSettings: {
                    ...state.noteSettings,
                    [id]: { ...(state.noteSettings[id] || { color: 'yellow' }), ...patch }
                }
            })),

        updateReviewUi: (patch) =>
            set((state) => ({
                reviewUi: { ...state.reviewUi, ...patch }
            })),

        // -----------------------------
        // import tasks (Background)
        // -----------------------------
        addImportTask: (t) => {
            const id = uuid();
            const now = new Date().toISOString();
            const task: ImportTask = {
                ...t,
                id,
                status: 'pending',
                progress: 0,
                successCount: 0,
                failedCount: 0,
                createdAt: now,
            };
            set((state) => ({
                importTasks: { ...state.importTasks, [id]: task }
            }));
            return id;
        },

        updateImportTask: (id, patch) => {
            set((state) => {
                const task = state.importTasks[id];
                if (!task) return state;
                return {
                    importTasks: {
                        ...state.importTasks,
                        [id]: { ...task, ...patch }
                    }
                };
            });
        },

        // -----------------------------
        // ✅ Commit helpers
        // -----------------------------
        commit: (m) => get().commitBatch([m]),

        commitBatch: (ms) =>
            set((state) => {
                let entities = state.entities;
                let watermark = state.watermark;
                let stale = state.stale;
                let effects = state.effects;

                // 注意：这里只做“局部 shallow copy”，避免每次都复制整个大对象
                const ensureEntitiesSlice = (slice: keyof EntitiesState) => {
                    if (entities === state.entities) entities = { ...state.entities };
                    if (entities[slice] === state.entities[slice]) entities[slice] = { ...state.entities[slice] };
                };

                for (const m of ms) {
                    switch (m.type) {
                        case 'watermark': {
                            if (watermark === state.watermark) watermark = { ...state.watermark };
                            watermark[m.key] = { at: m.at, seq: m.seq };
                            break;
                        }

                        case 'entity_patch': {
                            ensureEntitiesSlice(m.slice);
                            (entities[m.slice] as any)[m.id] = {
                                ...(entities[m.slice] as any)[m.id],
                                ...m.patch,
                                updatedAt: m.updatedAt,
                                seq: m.seq,
                            };
                            break;
                        }

                        case 'entity_remove': {
                            ensureEntitiesSlice(m.slice);
                            delete (entities[m.slice] as any)[m.id];
                            break;
                        }

                        case 'mark_stale': {
                            const keys = m.keys.filter((k) => k.startsWith('v:')); // 保守：staleMap 只存 viewKey
                            if (keys.length === 0) break;

                            if (stale === state.stale) stale = { ...state.stale };
                            const now = Date.now();

                            for (const k of keys) {
                                // Simplified batch logic: delegate to markStale semantics (but faster loop)
                                // We manually inline the logic here to avoid calling setState inside reducer (loop)
                                // But for simplicity/consistency in this 'commitBatch', we can set defaults.
                                // NOTE: This simple version doesn't have the full robustness of `markStale` action yet.
                                // For V2 hardening, we should ideally use the action logic or replicate it. 
                                // Replicating simplified version:
                                const prev = stale[k];
                                const opts = m.opts || {};
                                const strong = !!opts.strong; // only from manual
                                const pendingPr = m.priority ?? 0;

                                if (prev && (prev.priority ?? 0) > pendingPr && !strong) continue;
                                if (prev && (prev.priority ?? 0) === pendingPr && now - prev.markedAt < 200 && !strong && !!prev.prefetch === !!m.prefetch) continue;

                                stale[k] = {
                                    markedAt: now,
                                    reason: m.reason,
                                    priority: pendingPr,
                                    prefetch: m.prefetch,
                                    intent: m.reason === 'heartbeat' ? 'heartbeat' : 'signal', // signals 
                                    strong: false
                                };
                            }
                            break;
                        }

                        case 'push_effect': {
                            const id = m.effect.id || uuid();
                            const createdAt = (m.effect as any).createdAt || new Date().toISOString();

                            const k = effectDedupeKey(m.effect);
                            const now = Date.now();
                            const idx = effects.findIndex((e: any) => effectDedupeKey(e) === k);

                            if (idx !== -1) {
                                const ex: any = effects[idx];
                                const exAt = ex.createdAt ? Date.parse(ex.createdAt) : 0;
                                if (exAt && now - exAt < 1500) {
                                    effects = effects.slice();
                                    effects[idx] = { ...ex, ...m.effect, id: ex.id, createdAt } as UXEffect;
                                } else {
                                    effects = [...effects, { ...m.effect, id, createdAt } as UXEffect];
                                }
                            } else {
                                effects = [...effects, { ...m.effect, id, createdAt } as UXEffect];
                            }

                            const MAX = 5;
                            if (effects.length > MAX) effects = effects.slice(effects.length - MAX);
                            break;
                        }

                        case 'dismiss_effect': {
                            if (effects.some((e) => e.id === m.id)) effects = effects.filter((e) => e.id !== m.id);
                            break;
                        }
                    }
                }

                // 如果都没变，直接返回 state（减少无意义通知）
                if (entities === state.entities && watermark === state.watermark && stale === state.stale && effects === state.effects) {
                    return state;
                }

                return { ...state, entities, watermark, stale, effects };
            }),
    }))
);
