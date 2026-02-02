import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { pushAudit, pushSignal } from '../../lib/audit'
import { auth } from '../../lib/auth'

export const tags = new Elysia({ prefix: '/tags' })
    .use(auth)
    /**
     * GET /tags - List all tags with usage count
     */
    .get('/', async ({ user, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            const { data, error: dbError } = await supabase
                .from('tags')
                .select(`
                    *,
                    usage_count:error_question_tags(count)
                `)
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .order('name');

            if (dbError) throw dbError;

            const items = (data || []).map(t => {
                const usageData = Array.isArray(t.usage_count) ? t.usage_count[0] : (t.usage_count || {});
                return {
                    id: t.id,
                    name: t.name,
                    color: t.color,
                    type: 'tag',
                    nodeCount: usageData.count || 0,
                    updatedAt: t.updated_at,
                    seq: new Date(t.updated_at).getTime()
                };
            });

            return { items, serverTime: new Date().toISOString() };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })

    /**
     * POST /tags - Create or resolve tag
     */
    .post('/', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { name, color } = body;
            const { data, error: dbError } = await supabase
                .from('tags')
                .upsert({ name, color, user_id: user.id }, { onConflict: 'user_id,name' })
                .select()
                .single();

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'CREATE_TAG',
                entityType: 'tag',
                entityId: data.id,
                targetName: name
            });

            await pushSignal(user.id, 'asset', 'ADD', { id: data.id, type: 'tag' });
            return data;
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1, maxLength: 50 }),
            color: t.Optional(t.String())
        })
    })

    /**
     * POST /tags/merge - Atomic merge of two tags
     */
    .post('/merge', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { sourceId, targetId } = body;

            // 1. Handle question-tag associations via RPC
            const { error: moveError } = await supabase.rpc('merge_tags_atomic', {
                p_source_id: sourceId,
                p_target_id: targetId,
                p_user_id: user.id
            });
            if (moveError) throw moveError;

            // 2. Fetch metadata for audit
            const { data: sourceData } = await supabase.from('tags').select('name').eq('id', sourceId).single();
            const { data: targetData } = await supabase.from('tags').select('name').eq('id', targetId).single();

            // 3. Delete source
            const { error: deleteError } = await supabase
                .from('tags')
                .delete()
                .eq('id', sourceId)
                .eq('user_id', user.id);
            if (deleteError) throw deleteError;

            await pushAudit(user.id, {
                action: 'MERGE_TAG',
                entityType: 'tag',
                entityId: targetId,
                targetName: `${sourceData?.name} -> ${targetData?.name}`,
                payload: { sourceId, targetId }
            });

            await pushSignal(user.id, 'asset', 'REMOVE', { id: sourceId, type: 'tag' });
            await pushSignal(user.id, 'asset', 'UPDATE', { id: targetId, type: 'tag' });

            return { success: true };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Object({
            sourceId: t.String(),
            targetId: t.String()
        })
    })

    /**
     * PATCH /tags/:id - Update tag
     */
    .patch('/:id', async ({ user, params: { id }, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { name, color } = body;
            const { data, error: dbError } = await supabase
                .from('tags')
                .update({ name, color, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .select()
                .single();

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'UPDATE_TAG',
                entityType: 'tag',
                entityId: id,
                targetName: name,
                payload: body
            });

            await pushSignal(user.id, 'asset', 'UPDATE', { id, type: 'tag' });
            return data;
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Partial(t.Object({
            name: t.String({ minLength: 1, maxLength: 50 }),
            color: t.Optional(t.String())
        }))
    })


    .delete('/:id', async ({ user, params: { id }, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { data: tag } = await supabase.from('tags').select('name').eq('id', id).single();

            const { error: dbError } = await supabase
                .from('tags')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id);

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'DELETE_TAG',
                entityType: 'tag',
                entityId: id,
                targetName: tag?.name
            });

            await pushSignal(user.id, 'asset', 'REMOVE', { id, type: 'tag' });
            return { success: true };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })
