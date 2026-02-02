import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { pushAudit, pushSignal } from '../../lib/audit'
import { auth } from '../../lib/auth'

export const questions = new Elysia({ prefix: '/questions' })
    .use(auth)
    /**
     * GET /questions - Paginated list with filtering and search
     */
    .get('/', async ({ user, query, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { limit = 50, cursor, q, subjectId, type, difficulty, archived = 'false', tags } = query;

        // Parse tags filter
        const tagNames = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const hasTagFilter = tagNames.length > 0;

        // Dynamic select: use !inner join only when filtering by tags
        const selectQuery = hasTagFilter
            ? `
                id, title, content, question_type, difficulty, updated_at, is_archived, image_url,
                content_hash, last_synced_hash, hints, metadata, explanation, correct_answer, correct_answer_text,
                subject_id,
                subjects(id, name, color),
                error_question_tags!inner(tags!inner(id, name, color)),
                cards(id, state, due, stability, difficulty, reps, lapses, last_review)
            `
            : `
                id, title, content, question_type, difficulty, updated_at, is_archived, image_url,
                content_hash, last_synced_hash, hints, metadata, explanation, correct_answer, correct_answer_text,
                subject_id,
                subjects(id, name, color),
                error_question_tags(tags(id, name, color)),
                cards(id, state, due, stability, difficulty, reps, lapses, last_review)
            `;

        let dbQuery = supabase
            .from('error_questions')
            .select(selectQuery)
            .eq('user_id', user.id)
            .eq('is_archived', archived === 'true');

        if (q) {
            dbQuery = dbQuery.or(`title.ilike.%${q}%,content.ilike.%${q}%,explanation.ilike.%${q}%`);
        }

        if (subjectId && subjectId !== 'all') dbQuery = dbQuery.eq('subject_id', subjectId);
        if (type && type !== 'all') dbQuery = dbQuery.eq('question_type', type);
        if (difficulty && difficulty !== 'all') dbQuery = dbQuery.eq('difficulty', difficulty);

        // Tag filtering - only apply when tags are specified
        if (hasTagFilter) {
            dbQuery = dbQuery.in('error_question_tags.tags.name', tagNames);
        }

        dbQuery = dbQuery.order('updated_at', { ascending: false }).order('id', { ascending: false });

        if (cursor) {
            try {
                const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
                const { updatedAt, id } = decoded;
                if (updatedAt && id) {
                    dbQuery = dbQuery.or(`updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`);
                }
            } catch (e) {
                set.status = 400
                return { error: 'Invalid cursor format' }
            }
        }

        const { data, error: dbError } = await dbQuery.limit(limit + 1);
        if (dbError) {
            set.status = 500
            return { error: dbError.message }
        }

        const hasMore = (data?.length || 0) > (limit || 20);
        const rawItems = (data || []).slice(0, limit);

        const items = rawItems.map(q => {
            const card = Array.isArray(q.cards) ? q.cards[0] : (q.cards || null);
            const subject = Array.isArray(q.subjects) ? q.subjects[0] : (q.subjects || null);
            const rawTags = Array.isArray(q.error_question_tags) ? q.error_question_tags : [];

            return {
                ...q,
                question_id: q.id,
                subject_id: q.subject_id,
                subject_name: subject?.name || 'General',
                subject_color: subject?.color || null,
                tags: rawTags.map((t: any) => ({
                    id: t.tags?.id,
                    name: t.tags?.name,
                    color: t.tags?.color
                })).filter((t: any) => t.name),
                card: card,
                updatedAt: q.updated_at,
                seq: new Date(q.updated_at).getTime()
            };
        });

        let nextCursor = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            if (last) {
                nextCursor = Buffer.from(JSON.stringify({
                    updatedAt: last.updatedAt,
                    id: (last as any).id
                })).toString('base64');
            }
        }

        return { items, nextCursor, serverTime: new Date().toISOString() };
    }, {
        query: t.Object({
            limit: t.Optional(t.Numeric({ default: 20 })),
            cursor: t.Optional(t.String()),
            q: t.Optional(t.String()),
            subjectId: t.Optional(t.String()),
            type: t.Optional(t.String()),
            difficulty: t.Optional(t.String()),
            archived: t.Optional(t.String()),
            tags: t.Optional(t.String()),
            sort: t.Optional(t.String())
        })
    })

    /**
     * PATCH /questions/bulk - Bulk update multiple questions
     */
    .patch('/bulk', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        const { ids, update } = body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            set.status = 400
            return { error: 'No IDs provided' }
        }

        const { tags, ...coreData } = update;

        // 1. Update core fields
        if (Object.keys(coreData).length > 0) {
            const { error: updateError } = await supabase
                .from('error_questions')
                .update({ ...coreData, updated_at: new Date().toISOString() })
                .in('id', ids)
                .eq('user_id', user.id);

            if (updateError) {
                set.status = 500
                return { error: updateError.message }
            }
        }

        // 2. Handle Tags if provided
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const tagNames = [...new Set(tags
                .map((t: any) => typeof t === 'string' ? t.trim() : (t.name || '').trim())
                .filter(n => n.length > 0)
            )];

            if (tagNames.length > 0) {
                // Get or create tags
                const { data: existingTags } = await supabase
                    .from('tags')
                    .select('id, name')
                    .in('name', tagNames)
                    .eq('user_id', user.id);

                const existingNames = new Set(existingTags?.map(t => t.name) || []);
                const missingNames = tagNames.filter(n => !existingNames.has(n));
                const tagIds: string[] = existingTags?.map(t => t.id) || [];

                if (missingNames.length > 0) {
                    const { data: newTags } = await supabase
                        .from('tags')
                        .insert(missingNames.map(name => ({ name, user_id: user.id })))
                        .select('id');
                    if (newTags) tagIds.push(...newTags.map(t => t.id));
                }

                if (tagIds.length > 0) {
                    // For bulk, we'll ADD these tags to the questions (UPSERT into junction table)
                    const associations = ids.flatMap(qid => tagIds.map(tid => ({
                        question_id: qid,
                        tag_id: tid
                    })));

                    // Batch upsert into junction table
                    const { error: assocError } = await supabase
                        .from('error_question_tags')
                        .upsert(associations, { onConflict: 'question_id,tag_id' });

                    if (assocError) {
                        console.error('Bulk tag association error:', assocError);
                    }
                }
            }
        }

        await pushAudit(user.id, {
            action: 'BULK_UPDATE_QUESTIONS',
            entityType: 'question',
            payload: { count: ids.length, update }
        });

        await pushSignal(user.id, 'question_list', 'REFRESH');
        return { success: true, count: ids.length };
    }, {
        body: t.Object({
            ids: t.Array(t.String()),
            update: t.Partial(t.Object({
                subject_id: t.Optional(t.Union([t.String(), t.Null()])),
                difficulty: t.Optional(t.Union([
                    t.Literal('easy'),
                    t.Literal('medium'),
                    t.Literal('hard')
                ])),
                question_type: t.Optional(t.Union([
                    t.Literal('choice'),
                    t.Literal('fill_blank'),
                    t.Literal('short_answer')
                ])),
                is_archived: t.Optional(t.Boolean()),
                tags: t.Optional(t.Array(t.Any()))
            }))
        })
    })

    /**
     * DELETE /questions/bulk - Bulk delete multiple questions
     */
    .delete('/bulk', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        const { ids } = body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            set.status = 400
            return { error: 'No IDs provided' }
        }

        const { error } = await supabase
            .from('error_questions')
            .delete()
            .in('id', ids)
            .eq('user_id', user.id);

        if (error) {
            set.status = 500
            return { error: error.message }
        }

        await pushAudit(user.id, {
            action: 'BULK_DELETE_QUESTIONS',
            entityType: 'question',
            payload: { count: ids.length, ids }
        });

        await pushSignal(user.id, 'question_list', 'REFRESH');
        return { success: true, count: ids.length };
    }, {
        body: t.Object({
            ids: t.Array(t.String())
        })
    })

    /**
     * Group routes requiring :id
     */
    .group('/:id', app => app
        /**
         * GET /questions/:id - Get full question details
         */
        .get('/', async ({ user, params: { id }, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }

            const { data, error: dbError } = await supabase
                .from('error_questions')
                .select(`
                    *,
                    subjects(id, name, color),
                    error_question_tags(tags(id, name, color)),
                    cards(*)
                `)
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (dbError) {
                set.status = 404
                return { error: 'Question not found' }
            }

            const card = Array.isArray(data.cards) ? data.cards[0] : (data.cards || null);
            const subject = Array.isArray(data.subjects) ? data.subjects[0] : (data.subjects || null);
            const rawTags = Array.isArray(data.error_question_tags) ? data.error_question_tags : [];

            return {
                ...data,
                subject_name: subject?.name,
                subject_color: subject?.color,
                tags: rawTags.map((t: any) => ({
                    id: t.tags?.id,
                    name: t.tags?.name,
                    color: t.tags?.color
                })).filter((t: any) => t?.name),
                card
            };
        })

        /**
         * PATCH /questions/:id - Update question
         */
        .patch('/', async ({ user, params: { id }, body, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }

            try {
                const { tags, ...coreData } = body;

                const { data: question, error: updateError } = await supabase
                    .from('error_questions')
                    .update({
                        ...coreData,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', id)
                    .eq('user_id', user.id)
                    .select()
                    .single();

                if (updateError) {
                    set.status = 500
                    return { error: updateError.message }
                }

                if ('wrong_answer' in (body as any)) {
                    await supabase
                        .from('cards')
                        .update({ last_wrong_answer: (body as any).wrong_answer })
                        .eq('question_id', id)
                        .eq('user_id', user.id);
                }

                if (tags && Array.isArray(tags)) {
                    const tagNames = [...new Set(tags
                        .map((t: any) => typeof t === 'string' ? t.trim() : (t.name || '').trim())
                        .filter(n => n.length > 0)
                    )];

                    const tagIds: string[] = [];
                    if (tagNames.length > 0) {
                        const { data: existingTags } = await supabase
                            .from('tags')
                            .select('id, name')
                            .in('name', tagNames)
                            .eq('user_id', user.id);

                        const existingNames = new Set(existingTags?.map(t => t.name) || []);
                        const missingNames = tagNames.filter(n => !existingNames.has(n));

                        if (existingTags) tagIds.push(...existingTags.map(t => t.id));

                        if (missingNames.length > 0) {
                            const { data: newTags } = await supabase
                                .from('tags')
                                .insert(missingNames.map(name => ({ name, user_id: user.id })))
                                .select('id');
                            if (newTags) tagIds.push(...newTags.map(t => t.id));
                        }
                    }

                    await supabase.from('error_question_tags').delete().eq('question_id', id);
                    if (tagIds.length > 0) {
                        await supabase.from('error_question_tags').insert(
                            tagIds.map(tid => ({ question_id: id, tag_id: tid }))
                        );
                    }
                }

                await pushAudit(user.id, {
                    action: 'UPDATE_QUESTION',
                    entityType: 'question',
                    entityId: id,
                    targetName: question.title,
                    payload: coreData
                });

                await pushSignal(user.id, 'question_list', 'UPDATE', { id });

                return { success: true, question };
            } catch (err: any) {
                set.status = 500
                return { error: err.message }
            }
        }, {
            body: t.Partial(t.Object({
                title: t.Optional(t.String({ maxLength: 500 })),
                content: t.Optional(t.Union([t.String({ maxLength: 100000 }), t.Null()])),
                explanation: t.Optional(t.Union([t.String({ maxLength: 50000 }), t.Null()])),
                question_type: t.Optional(t.Union([
                    t.Literal('choice'),
                    t.Literal('fill_blank'),
                    t.Literal('short_answer')
                ])),
                difficulty: t.Optional(t.Union([
                    t.Literal('easy'),
                    t.Literal('medium'),
                    t.Literal('hard')
                ])),
                correct_answer: t.Optional(t.Any()),
                correct_answer_text: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
                hints: t.Optional(t.Any()),
                metadata: t.Optional(t.Any()),
                subject_id: t.Optional(t.Union([t.String(), t.Null()])),
                is_archived: t.Optional(t.Boolean()),
                image_url: t.Optional(t.Union([t.String(), t.Null()])),
                explanation_image_url: t.Optional(t.Union([t.String(), t.Null()])),
                correct_answer_image_url: t.Optional(t.Union([t.String(), t.Null()])),
                tags: t.Optional(t.Array(t.Object({
                    id: t.Optional(t.String()),
                    name: t.String()
                })))
            }))
        })

        /**
         * DELETE /questions/:id - Hard delete or toggle archive
         */
        .delete('/', async ({ user, params: { id }, query, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
            const hard = query.hard === 'true';

            if (hard) {
                const { error: delError } = await supabase
                    .from('error_questions')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', user.id);
                if (delError) {
                    set.status = 500
                    return { error: delError.message }
                }
            } else {
                const { error: arcError } = await supabase
                    .from('error_questions')
                    .update({ is_archived: true, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .eq('user_id', user.id);
                if (arcError) {
                    set.status = 500
                    return { error: arcError.message }
                }
            }

            await pushAudit(user.id, {
                action: hard ? 'DELETE_QUESTION' : 'ARCHIVE_QUESTION',
                entityType: 'question',
                entityId: id
            });

            await pushSignal(user.id, 'question_list', 'REMOVE', { id });
            return { success: true };
        }, {
            query: t.Object({
                hard: t.Optional(t.String())
            })
        })
    )
