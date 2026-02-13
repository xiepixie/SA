import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { auth } from '../../lib/auth'

export const notes = new Elysia({ prefix: '/notes' })
    .use(auth)

    /**
     * GET /search - Unified search across notes AND questions
     * Used by wiki link autocompletion in the editor
     * Returns mixed results with type discriminator
     */
    .get('/search', async ({ user, query, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { q, limit = 10 } = query;
        if (!q || q.trim().length === 0) {
            return { results: [] };
        }

        const searchTerm = `%${q.trim()}%`;

        // Search notes (GLOBAL type) and questions in parallel
        const [notesRes, questionsRes] = await Promise.all([
            supabase
                .from('notes')
                .select('id, title, type, updated_at')
                .eq('user_id', user.id)
                .eq('type', 'GLOBAL')
                .eq('is_folder', false)
                .ilike('title', searchTerm)
                .order('updated_at', { ascending: false })
                .limit(limit),
            supabase
                .from('error_questions')
                .select('id, title')
                .eq('user_id', user.id)
                .ilike('title', searchTerm)
                .limit(limit)
        ]);

        const results: Array<{
            id: string;
            title: string;
            type: 'note' | 'question';
            snippet?: string;
        }> = [];

        // Add note results
        if (notesRes.data) {
            for (const note of notesRes.data) {
                results.push({
                    id: note.id,
                    title: note.title || 'Untitled',
                    type: 'note',
                });
            }
        }

        // Add question results
        if (questionsRes.data) {
            for (const q of questionsRes.data) {
                results.push({
                    id: q.id,
                    title: q.title || `Question ${q.id.slice(0, 8)}`,
                    type: 'question',
                });
            }
        }

        return { results: results.slice(0, limit) };
    }, {
        query: t.Object({
            q: t.String(),
            limit: t.Optional(t.Numeric({ default: 10 }))
        })
    })

    /**
     * GET / - List notes with filtering
     * Supports:
     * - questionId: Get the specific Jot for a question (type=QUESTION)
     * - parentId: Get children of a folder (type=GLOBAL)
     * - q: Search query (using pg_trgm on distinct plain_text)
     */
    .get('/', async ({ user, query, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { limit = 50, cursor, q, questionId, parentId, type } = query;

        let dbQuery = supabase
            .from('notes')
            .select('id, title, content, plain_text, type, is_folder, parent_id, question_id, created_at, updated_at')
            .eq('user_id', user.id);

        // Filter: Specific Question Jot
        if (questionId) {
            dbQuery = dbQuery.eq('question_id', questionId);
            // If strictly looking for the Jot, ensure type is QUESTION
            // (Though Schema constraints ensure Global notes don't have question_id)
        }

        // Filter: Folder Navigation
        if (parentId) {
            dbQuery = dbQuery.eq('parent_id', parentId);
        } else if (parentId === null && !questionId && !q) {
            // Root (Global only, exclude jots not in this view)
            // But usually Jots are hidden from "Notebook" view unless searched
            if (type === 'GLOBAL') {
                dbQuery = dbQuery.is('parent_id', null).eq('type', 'GLOBAL');
            }
        }

        // Filter: Type
        if (type) {
            dbQuery = dbQuery.eq('type', type);
        }

        // Filter: Search
        if (q) {
            // Using pg_trgm similarity or simple ILIKE depending on performance needs
            // plain_text should be indexed with gin_trgm_ops
            dbQuery = dbQuery.ilike('plain_text', `%${q}%`);
            // Note: .textSearch() uses FTS, .ilike() uses pg_trgm if configured with GIN
        }

        // Pagination (Cursor = updated_at)
        if (cursor) {
            // Assume Base64 encoded JSON { updatedAt: string, id: string }
            try {
                const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
                dbQuery = dbQuery.lt('updated_at', decoded.updatedAt);
            } catch (e) {
                // Invalid cursor, ignore
            }
        }

        const { data, error } = await dbQuery
            .order('updated_at', { ascending: false })
            .limit(limit + 1);

        if (error) {
            set.status = 500
            return { error: error.message }
        }

        const hasMore = (data?.length || 0) > limit;
        const items = (data || []).slice(0, limit);

        let nextCursor = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            if (last) {
                nextCursor = Buffer.from(JSON.stringify({
                    updatedAt: last.updated_at,
                    id: last.id
                })).toString('base64');
            }
        }

        return { items, nextCursor };
    }, {
        query: t.Object({
            limit: t.Optional(t.Numeric({ default: 50 })),
            cursor: t.Optional(t.String()),
            q: t.Optional(t.String()),
            questionId: t.Optional(t.String()),
            parentId: t.Optional(t.String()),
            type: t.Optional(t.String())
        })
    })

    /**
     * GET /references - Get backlinks
     */
    .get('/references', async ({ user, query, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { targetQuestionId, targetNoteId } = query;

        let dbQuery = supabase
            .from('note_references')
            .select(`
                id,
                source_note_id,
                notes:source_note_id (id, title, type, updated_at),
                target_part,
                target_anchor,
                mode,
                created_at
            `)
        // Ensure we are filtering by references access (handled by RLS policy "Users can manage their own references")
        // But we should explicit check user ownership via join if RLS isn't trustworthy enough?
        // RLS policy: EXISTS (SELECT 1 FROM notes WHERE id = source_note_id AND user_id = auth.uid())
        // So result will only contain user's refs.

        if (targetQuestionId) {
            dbQuery = dbQuery.eq('target_question_id', targetQuestionId);
        } else if (targetNoteId) {
            dbQuery = dbQuery.eq('target_note_id', targetNoteId);
        } else {
            set.status = 400;
            return { error: 'Must provide targetQuestionId or targetNoteId' };
        }

        const { data, error } = await dbQuery.limit(100);

        if (error) {
            set.status = 500;
            return { error: error.message };
        }

        return { items: data };
    }, {
        query: t.Object({
            targetQuestionId: t.Optional(t.String()),
            targetNoteId: t.Optional(t.String())
        })
    })

    /**
     * GET /:id - Single Note
     */
    .get('/:id', async ({ user, params: { id }, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !data) {
            set.status = 404
            return { error: 'Note not found' }
        }

        return data;
    })

    /**
     * POST / - Create Note
     */
    .post('/', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { type, questionId, title, content, plainText, isFolder, parentId } = body;

        // Validation for Question ID requirement (Double check logic)
        if (type === 'QUESTION' && !questionId) {
            set.status = 400
            return { error: 'Question ID required for Question Notes' }
        }

        const { data, error } = await supabase
            .from('notes')
            .insert({
                user_id: user.id,
                type,
                question_id: questionId || null,
                title: title || null,
                content: content || null,
                plain_text: plainText || '',
                is_folder: isFolder || false,
                parent_id: parentId || null
            })
            .select()
            .single();

        if (error) {
            set.status = 500
            return { error: error.message }
        }

        return data;
    }, {
        body: t.Object({
            type: t.String(), // 'QUESTION' | 'GLOBAL'
            questionId: t.Optional(t.String()),
            title: t.Optional(t.String()),
            content: t.Optional(t.Object({})), // JSON
            plainText: t.Optional(t.String()),
            isFolder: t.Optional(t.Boolean()),
            parentId: t.Optional(t.String())
        })
    })

    /**
     * PATCH /:id - Atomic Update (Content + References)
     */
    .patch('/:id', async ({ user, params: { id }, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { content, plainText, refs, title } = body;

        // If simple metadata update (title), use standard update
        if (title !== undefined && content === undefined) {
            const { error } = await supabase
                .from('notes')
                .update({ title, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', user.id);

            if (error) { set.status = 500; return { error: error.message }; }
            return { success: true };
        }

        // If content update, use RPC for Atomic Reference Sync
        if (content !== undefined) {
            // p_refs array construction done by client, passed here as 'refs'
            // Format: Array<{ ref_node_id, target_question_id, ... }>

            // Validation: Ensure refs is array
            const refsArray = Array.isArray(refs) ? refs : [];

            const { error } = await supabase.rpc('update_note_with_references', {
                p_note_id: id,
                p_user_id: user.id,
                p_content: content,
                p_plain_text: plainText || '',
                p_refs: refsArray,
                p_title: title
            });

            if (error) {
                console.error("RPC Error:", error);
                set.status = 500;
                return { error: error.message };
            }

            return { success: true };
        }

        return { success: true };
    }, {
        body: t.Object({
            title: t.Optional(t.String()),
            content: t.Optional(t.Object({})),
            plainText: t.Optional(t.String()),
            refs: t.Optional(t.Array(t.Object({
                ref_node_id: t.String(),
                target_question_id: t.Optional(t.Union([t.String(), t.Null()])),
                target_note_id: t.Optional(t.Union([t.String(), t.Null()])),
                target_part: t.Optional(t.Union([t.String(), t.Null()])),
                target_anchor: t.Optional(t.Union([t.String(), t.Null()])),
                mode: t.Optional(t.String())
            })))
        })
    })

    /**
     * PATCH /:id/move - Move note to a different folder
     */
    .patch('/:id/move', async ({ user, params: { id }, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { parentId } = body;

        // If parentId is provided, verify it exists and is a folder
        if (parentId) {
            const { data: parentNote, error: parentError } = await supabase
                .from('notes')
                .select('id, is_folder')
                .eq('id', parentId)
                .eq('user_id', user.id)
                .single();

            if (parentError || !parentNote) {
                set.status = 404;
                return { error: 'Target folder not found' };
            }
            if (!parentNote.is_folder) {
                set.status = 400;
                return { error: 'Target is not a folder' };
            }
        }

        const { error } = await supabase
            .from('notes')
            .update({
                parent_id: parentId || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            set.status = 500;
            return { error: error.message };
        }

        return { success: true };
    }, {
        body: t.Object({
            parentId: t.Union([t.String(), t.Null()])
        })
    })

    /**
     * DELETE /:id
     */
    .delete('/:id', async ({ user, params: { id }, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            set.status = 500
            return { error: error.message }
        }

        return { success: true }
    });
