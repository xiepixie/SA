import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { pushAudit, pushSignal } from '../../lib/audit'
import { auth } from '../../lib/auth'

export const subjects = new Elysia({ prefix: '/subjects' })
    .use(auth)
    /**
     * GET /subjects - List all subjects with counts
     */
    .get('/', async ({ user, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            // Fetch subjects with counts of questions and cards
            // [Fix] Subjects and cards are not directly related. Path: subjects -> error_questions -> cards
            const { data, error: dbError } = await supabase
                .from('subjects')
                .select(`
                    id,
                    name,
                    color,
                    updated_at,
                    error_questions(
                        id,
                        cards(id)
                    )
                `)
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .order('name');

            if (dbError) throw dbError;

            const items = (data || []).map(s => {
                const questions = s.error_questions || [];
                const cardCount = questions.reduce((acc, q) => {
                    const cards = q.cards || [];
                    return acc + (Array.isArray(cards) ? cards.length : (cards ? 1 : 0));
                }, 0);

                return {
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    type: 'subject',
                    questionCount: questions.length,
                    cardCount: cardCount,
                    updatedAt: s.updated_at,
                    seq: new Date(s.updated_at).getTime()
                };
            });

            return { items, serverTime: new Date().toISOString() };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })

    /**
     * POST /subjects - Create new subject
     */
    .post('/', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { name, color } = body;
            const { data, error: dbError } = await supabase
                .from('subjects')
                .upsert({ name, color, user_id: user.id }, { onConflict: 'user_id,name' })
                .select()
                .single();

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'CREATE_SUBJECT',
                entityType: 'subject',
                entityId: data.id,
                targetName: name
            });

            await pushSignal(user.id, 'asset', 'ADD', { id: data.id, type: 'subject' });
            return data;
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Object({
            name: t.String({ minLength: 1, maxLength: 100 }),
            color: t.Optional(t.String())
        })
    })

    /**
     * PATCH /subjects/:id - Update subject
     */
    .patch('/:id', async ({ user, params: { id }, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { name, color } = body;
            const { data, error: dbError } = await supabase
                .from('subjects')
                .update({ name, color, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id)
                .select()
                .single();

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'UPDATE_SUBJECT',
                entityType: 'subject',
                entityId: id,
                targetName: name,
                payload: body
            });

            await pushSignal(user.id, 'asset', 'UPDATE', { id, type: 'subject' });
            return data;
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Partial(t.Object({
            name: t.String({ minLength: 1, maxLength: 100 }),
            color: t.Optional(t.String())
        }))
    })

    /**
     * POST /subjects/merge - Atomic merge of two subjects
     */
    .post('/merge', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { sourceId, targetId } = body;

            // 1. Fetch metadata for audit
            const { data: sourceData } = await supabase.from('subjects').select('name').eq('id', sourceId).single();
            const { data: targetData } = await supabase.from('subjects').select('name').eq('id', targetId).single();

            // 2. Re-associate questions
            const { error: moveError } = await supabase
                .from('error_questions')
                .update({ subject_id: targetId })
                .eq('subject_id', sourceId)
                .eq('user_id', user.id);
            if (moveError) throw moveError;

            // 3. Delete source
            const { error: deleteError } = await supabase
                .from('subjects')
                .delete()
                .eq('id', sourceId)
                .eq('user_id', user.id);
            if (deleteError) throw deleteError;

            await pushAudit(user.id, {
                action: 'MERGE_SUBJECT',
                entityType: 'subject',
                entityId: targetId,
                targetName: `${sourceData?.name} -> ${targetData?.name}`,
                payload: { sourceId, targetId }
            });

            await pushSignal(user.id, 'asset', 'REMOVE', { id: sourceId, type: 'subject' });
            await pushSignal(user.id, 'asset', 'UPDATE', { id: targetId, type: 'subject' });

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
     * DELETE /subjects/:id - Soft delete subject
     */

    .delete('/:id', async ({ user, params: { id }, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const { data: subject } = await supabase.from('subjects').select('name').eq('id', id).single();

            const { error: dbError } = await supabase
                .from('subjects')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id);

            if (dbError) throw dbError;

            await pushAudit(user.id, {
                action: 'DELETE_SUBJECT',
                entityType: 'subject',
                entityId: id,
                targetName: subject?.name
            });

            await pushSignal(user.id, 'asset', 'REMOVE', { id, type: 'subject' });
            return { success: true };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })
