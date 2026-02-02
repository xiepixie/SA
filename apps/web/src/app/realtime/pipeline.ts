import { applyEvent } from '../state/reducers';
import type {
    UnifiedEvent,
    RealtimeTopic
} from '@v2/shared';

/**
 * fromSignalRow: Translates DB signal row to UnifiedEvent
 */
export function fromSignalRow(row: any): UnifiedEvent {
    return {
        source: { kind: "signal" },
        topic: row.topic as RealtimeTopic,
        entityKey: String(row.entity_key),
        op: row.op,
        updatedAt: row.updated_at || new Date().toISOString(),
        seq: Number(row.seq || 0),
        payload: row.payload || {},
    };
}

/**
 * fromPulseRow: Translates DB pulse row to UnifiedEvent
 */
export function fromPulseRow(
    table: "cards_sync_pulse" | "import_jobs_pulse" | "user_dashboard_pulse",
    row: any
): UnifiedEvent {
    let entityKey = "";
    let topic: RealtimeTopic = "dashboard";

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
        seq: Number(row.seq || 0),
        payload: row,
    };
}

/**
 * Main Entry: handlePostgresChange
 */
export const handlePostgresChange = (table: string, payload: any) => {
    const row = payload.new || payload.old;
    if (!row) return;

    let event: UnifiedEvent | null = null;

    if (table === 'realtime_signals') {
        event = fromSignalRow(row);
    } else if (
        table === 'cards_sync_pulse' ||
        table === 'import_jobs_pulse' ||
        table === 'user_dashboard_pulse'
    ) {
        event = fromPulseRow(table as any, row);
    }

    if (event) {
        applyEvent(event);
    }
};
