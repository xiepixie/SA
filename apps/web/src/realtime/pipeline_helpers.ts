import type { UnifiedEvent } from "@v2/shared";

export function fromSignalRow(row: any): UnifiedEvent {
    return {
        source: { kind: "signal" },
        topic: row.topic,
        entityKey: String(row.entity_key),
        op: row.op,
        updatedAt: row.updated_at || new Date().toISOString(),
        seq: row.seq, // If the DB schema supports ID-based or version-based seq
        payload: row.payload || {},
    };
}

export function fromPulseRow(
    table: "cards_sync_pulse" | "import_jobs_pulse" | "user_dashboard_pulse",
    row: any
): UnifiedEvent {
    let entityKey = "";
    let topic: any = "";

    if (table === "cards_sync_pulse") {
        entityKey = String(row.card_id);
        topic = "card";
    } else if (table === "import_jobs_pulse") {
        entityKey = String(row.job_id);
        topic = "job";
    } else if (table === "user_dashboard_pulse") {
        entityKey = String(row.user_id || "global");
        topic = "dashboard";
    }

    return {
        source: { kind: "pulse", table },
        topic,
        entityKey,
        op: "UPDATE",
        updatedAt: row.updated_at || new Date().toISOString(),
        seq: row.seq ?? 0, // Pulse rows may not have seq, default to 0
        payload: row,
    };
}
