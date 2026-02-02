import { supabase } from './supabase'

/**
 * Pushes a real-time signal to notify clients of updates.
 */
export async function pushSignal(userId: string, topic: string, op: string, payload: any = {}) {
    try {
        const { error } = await supabase.from('realtime_signals').upsert({
            user_id: userId,
            topic,
            op,
            payload,
            entity_key: payload.id || 'general'
        }, { onConflict: 'user_id,topic,entity_key' });

        if (error) throw error;
    } catch (err) {
        console.warn('⚠️ [Signal] Failed to push signal:', err);
    }
}

/**
 * Pushes an audit event to track user actions.
 */
export async function pushAudit(userId: string, params: {
    action: string,
    entityType: string,
    entityId?: string,
    targetName?: string,
    payload?: any,
    undoable?: boolean
}) {
    const { action, entityType, entityId, targetName, payload = {}, undoable = false } = params;
    try {
        const { error } = await supabase.from('audit_events').insert({
            user_id: userId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            target_name: targetName,
            payload,
            undoable
        });
        if (error) throw error;
    } catch (err) {
        console.warn('⚠️ [Audit] Failed to push audit:', err);
    }
}
