import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { auth } from '../../lib/auth'

export const audit = new Elysia({ prefix: '/audit' })
    .use(auth)
    /**
     * GET /audit/timeline - Fetch user activity logs
     */
    .get('/timeline', async ({ user, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            const { data, error: dbError } = await supabase
                .from('audit_events')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (dbError) throw dbError;

            const items = (data || []).map(event => ({
                id: event.id,
                action: event.action,
                target: event.target_name || (event.entity_type + ':' + event.entity_id),
                user: user.email || 'User',
                time: event.created_at,
                undoable: event.undoable || false
            }));

            return { items, serverTime: new Date().toISOString() };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })

    /**
     * POST /audit/undo/:id - Revert an undoable audit event
     * Uses stored payload to restore previous state
     */
    .post('/undo/:id', async ({ user, params, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { id } = params;

        try {
            // 1. Fetch the audit event
            const { data: event, error: fetchError } = await supabase
                .from('audit_events')
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (fetchError || !event) {
                set.status = 404
                return { error: 'Audit event not found' }
            }

            if (!event.undoable) {
                set.status = 400
                return { error: 'This action cannot be undone' }
            }

            const payload = event.payload as Record<string, any> | null;
            const entityType = event.entity_type;
            const entityId = event.entity_id;
            const action = (event.action as string).toUpperCase();

            // 2. Apply reversal based on action type
            if (action.includes('DELETE') && payload?.previous_state) {
                // Restore soft-deleted item by clearing deleted_at
                if (entityType === 'subject') {
                    await supabase
                        .from('subjects')
                        .update({ deleted_at: null, ...payload.previous_state })
                        .eq('id', entityId);
                } else if (entityType === 'tag') {
                    await supabase
                        .from('tags')
                        .update({ deleted_at: null, ...payload.previous_state })
                        .eq('id', entityId);
                }
            } else if (action.includes('UPDATE') && payload?.previous_state) {
                // Restore to previous state
                if (entityType === 'subject') {
                    await supabase
                        .from('subjects')
                        .update(payload.previous_state)
                        .eq('id', entityId);
                } else if (entityType === 'tag') {
                    await supabase
                        .from('tags')
                        .update(payload.previous_state)
                        .eq('id', entityId);
                }
            } else if (action.includes('CREATE') && entityId) {
                // Soft delete the created item
                if (entityType === 'subject') {
                    await supabase
                        .from('subjects')
                        .update({ deleted_at: new Date().toISOString() })
                        .eq('id', entityId);
                } else if (entityType === 'tag') {
                    await supabase
                        .from('tags')
                        .update({ deleted_at: new Date().toISOString() })
                        .eq('id', entityId);
                }
            } else {
                set.status = 400
                return { error: 'Undo not supported for this action type or missing payload' }
            }

            // 3. Mark this audit event as no longer undoable
            await supabase
                .from('audit_events')
                .update({ undoable: false })
                .eq('id', id);

            // 4. Create a new audit event for the undo action
            await supabase
                .from('audit_events')
                .insert({
                    user_id: user.id,
                    action: 'UNDO_' + action,
                    entity_type: entityType,
                    entity_id: entityId,
                    target_name: event.target_name,
                    payload: { original_event_id: id },
                    undoable: false
                });

            return { success: true, revertedEventId: id };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        params: t.Object({ id: t.String() })
    })
