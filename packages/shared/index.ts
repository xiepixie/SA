// Shared Types for V2 Architecture (Canonical Design)

export type RealtimeTopic =
    | "question"
    | "question_list"
    | "exam"
    | "exam_list"
    | "due_list"
    | "asset"
    | "job"
    | "card"
    | "card_overlay"
    | "dashboard"; // Standardized as an entity (e:dashboard:me)

export type RealtimeOp = "UPSERT" | "UPDATE" | "REMOVE" | "REFRESH" | "ADD";

export type EntityKey = string; // uuid::text | "global"
export type WatermarkKey = `wm:${"signal" | "pulse" | "view"}:${string}`; // Final standardized format
export type StaleKey = `v:${RealtimeTopic}` | `e:${RealtimeTopic}:${EntityKey}`;
export type RevalidateKey = StaleKey;

export type UnifiedSource =
    | { kind: "signal" }
    | { kind: "pulse"; table: "cards_sync_pulse" | "import_jobs_pulse" | "user_dashboard_pulse" };

export interface UnifiedEvent {
    source: UnifiedSource;
    topic: RealtimeTopic;
    entityKey: EntityKey;
    op: RealtimeOp;
    updatedAt: string; // ISO
    seq: number;       // High-precision sequence from DB
    payload: Record<string, any>;
}

export interface UXEffect {
    id: string;
    type: "toast" | "badge" | "silent";
    message: string;
    level?: "info" | "success" | "warning" | "error";
    createdAt?: string;
    sticky?: boolean;
}

export type PatchMode = "none" | "entity_patch" | "tombstone_remove" | "mark_stale";

export interface ViewResponse<T> {
    items: T[];
    deletedIds?: string[];
    serverTime: string;
    etag?: string;
}

// ---------- Import Types ----------

export type QuestionType = 'choice' | 'fill_blank' | 'short_answer';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ImportItem {
    __row: number;
    question: {
        title: string;
        content?: string | null;
        question_type: QuestionType;
        difficulty: Difficulty;
        explanation?: string | null;
        correct_answer: any;
        correct_answer_text?: string | null;
        hints?: any | null;
        metadata?: any | null;
        image_url?: string | null;
        explanation_image_url?: string | null;
        correct_answer_image_url?: string | null;
        subject_id?: string | null;
    };
    subject_name?: string | null;
    tag_names?: string[] | null;
    resolved?: {
        subject_id?: string | null;
        tag_ids?: string[] | null;
    };
}

export interface ImportConfig {
    defaultSubjectId?: string;
    defaultTagIds?: string[];
    create_cards?: boolean;
    cards_due_start?: string; // ISO
    cards_due_spread?: 'immediate' | 'spread_1d' | 'spread_7d';
    importBatchId?: string;
}

export interface ImportPipelineResult {
    success: number;
    failed: number;
    rowErrors: Array<{ row: number; error: string }>;
    insertedIds: string[];
    importBatchId: string;
    tagAssoc?: { success: number; failed: number };
    cards?: { success: number; failed: number; cardIds: string[] };
}

// ---------- helpers ----------
export function wmKey(source: "signal" | "pulse" | "view", target: string): WatermarkKey {
    return `wm:${source}:${target}` as WatermarkKey;
}

export function shouldApply(
    prevAt: string | undefined,
    incomingAt: string,
    op: RealtimeOp,
    prevSeq = 0,
    incomingSeq = 0
): boolean {
    if (!prevAt) return true;

    // 1. Compare timestamp
    if (incomingAt > prevAt) return true;
    if (incomingAt < prevAt) return false;

    // 2. Compare sequence if timestamps match
    if (incomingSeq > prevSeq) return true;
    if (incomingSeq < prevSeq) return false;

    // 3. Same-ms, same-seq Tie-break: REMOVE wins
    if (op === "REMOVE") return true;

    return false;
}

export const APP_VERSION = '5.9.0';
