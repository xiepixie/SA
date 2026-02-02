import { Elysia, t } from 'elysia'
import { supabase } from '../../lib/supabase'
import { auth } from '../../lib/auth'

export const study = new Elysia()

    .use(auth)
    /**
     * GET /study/dashboard - Summary stats for study
     */
    .get('/dashboard', async ({ user, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            const { data, error: dbError } = await supabase
                .from('cards')
                .select('state', { count: 'exact' })
                .eq('user_id', user.id);

            if (dbError) throw dbError;

            // Simplified stats aggregation
            const stats = {
                new: 0,
                learning: 0,
                due: 0,
                relearning: 0,
                total: data?.length || 0
            };

            const now = new Date().toISOString();
            // We'd ideally do this in a single query with filters, but for simplicity:
            const { count: dueCount } = await supabase
                .from('cards')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .lte('due', now);

            data.forEach(c => {
                if (c.state === 0) stats.new++;
                if (c.state === 1) stats.learning++;
                if (c.state === 2) stats.due++; // Review state
                if (c.state === 3) stats.relearning++;
            });

            return {
                stats: {
                    ...stats,
                    dueToday: dueCount || 0
                },
                serverTime: new Date().toISOString()
            };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    })

    /**
     * GET /study/due-list - List cards for review
     */
    .get('/due-list', async ({ user, query, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            const now = new Date();
            const mode = query.mode || 'due';

            let dueFilter: string;
            if (mode === 'all') {
                dueFilter = new Date('2099-12-31').toISOString();
            } else if (mode === 'upcoming') {
                const upcoming = new Date(now);
                upcoming.setDate(upcoming.getDate() + 3);
                dueFilter = upcoming.toISOString();
            } else {
                dueFilter = now.toISOString();
            }

            const { data, error: dbError } = await supabase
                .from('cards')
                .select(`
                    id, question_id, due, state, stability, difficulty, reps, lapses, 
                    last_review, last_wrong_answer, updated_at, created_at, subscribed_at,
                    error_questions(
                        id, title, content, question_type, difficulty, 
                        correct_answer, correct_answer_text, hints, explanation, image_url,
                        subject_id, subjects(id, name, color)
                    )
                `)
                .eq('user_id', user.id)
                .lte('due', dueFilter)
                .order('due', { ascending: true })
                .limit(mode === 'all' ? 200 : 100);

            if (dbError) throw dbError;

            const items = (data || []).map(card => {
                const question = Array.isArray(card.error_questions)
                    ? card.error_questions[0]
                    : card.error_questions;
                const subjectRaw = question?.subjects;
                const subject = Array.isArray(subjectRaw) ? subjectRaw[0] : subjectRaw;

                return {
                    card_id: card.id,
                    question_id: card.question_id,
                    due: card.due,
                    state: card.state,
                    stability: card.stability,
                    difficulty: card.difficulty,
                    reps: card.reps,
                    lapses: card.lapses,
                    last_review: card.last_review,
                    last_wrong_answer: card.last_wrong_answer,
                    subscribed_at: card.subscribed_at,
                    title: question?.title || 'Untitled',
                    content: question?.content,
                    question_type: question?.question_type,
                    question_difficulty: question?.difficulty,
                    correct_answer: question?.correct_answer,
                    correct_answer_text: question?.correct_answer_text,
                    hints: question?.hints,
                    explanation: question?.explanation,
                    image_url: question?.image_url,
                    subject_id: question?.subject_id,
                    subject_name: subject?.name || null,
                    subject_color: subject?.color || null,
                    updatedAt: card.updated_at,
                    seq: new Date(card.updated_at).getTime()
                };
            });

            return { items, serverTime: new Date().toISOString() };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        query: t.Object({
            mode: t.Optional(t.Union([
                t.Literal('due'),
                t.Literal('upcoming'),
                t.Literal('all')
            ]))
        })
    })

    /**
     * POST /study/review/preview - Preview next FSRS states for a card
     */
    .post('/review/preview', async ({ body, set }) => {
        try {
            const fsrs = await import('@v2/fsrs-engine');
            const { card_id, stability, difficulty, days_elapsed, subject_id } = body;

            // Get FSRS profile
            const { data: profile } = await supabase.rpc('get_user_fsrs_profile', { p_subject_id: subject_id || null });
            const weights = profile?.weights || null;
            const desiredRetention = profile?.retention_target || 0.9;

            const memory = stability > 0 ? { stability, difficulty } : null;
            const states = fsrs.nextStates(memory, desiredRetention, days_elapsed, weights);
            const retrievability = stability > 0
                ? fsrs.retrievability(stability, difficulty, days_elapsed)
                : 1.0;

            return {
                success: true,
                card_id,
                intervals: {
                    again: Math.round(states.again.interval),
                    hard: Math.round(states.hard.interval),
                    good: Math.round(states.good.interval),
                    easy: Math.round(states.easy.interval),
                },
                states,
                retrievability
            };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Object({
            card_id: t.String(),
            stability: t.Number(),
            difficulty: t.Number(),
            days_elapsed: t.Number(),
            subject_id: t.Optional(t.String())
        })
    })

    /**
     * POST /study/review/submit - Persist a review result
     */
    .post('/review/submit', async ({ body, user, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }

        try {
            const fsrs = await import('@v2/fsrs-engine');
            const { card_id, rating, stability, difficulty, days_elapsed, duration_ms, subject_id, client_request_id } = body;

            const { data: profile } = await supabase.rpc('get_user_fsrs_profile', { p_subject_id: subject_id || null });
            const weights = profile?.weights || null;
            const desiredRetention = profile?.retention_target || 0.9;

            const memory = stability > 0 ? { stability, difficulty } : null;
            const result = fsrs.review(memory, rating, desiredRetention, days_elapsed, weights);

            const intervalMs = result.selected.interval * 24 * 60 * 60 * 1000;
            const newDue = new Date(Date.now() + intervalMs);

            let newState: number;
            if (rating === 1) newState = stability === 0 ? 1 : 3;
            else if (stability === 0) newState = result.selected.interval >= 1 ? 2 : 1;
            else newState = 2;

            const { error: rpcError } = await supabase.rpc('submit_review', {
                p_user_id: user.id,
                p_card_id: card_id,
                p_rating: rating,
                p_new_state: newState,
                p_new_stability: result.selected.stability,
                p_new_difficulty: result.selected.difficulty,
                p_new_due: newDue.toISOString(),
                p_scheduled_days: Math.round(result.selected.interval),
                p_duration_ms: duration_ms || null,
                p_algo_version: 'fsrs_v5_modular',
                p_weights: weights,
                p_client_request_id: client_request_id || null
            });

            if (rpcError) throw rpcError;

            return {
                success: true,
                card_id,
                rating,
                new_state: {
                    state: newState,
                    stability: result.selected.stability,
                    difficulty: result.selected.difficulty,
                    due: newDue.toISOString(),
                    interval: Math.round(result.selected.interval)
                },
                retrievability: result.retrievability
            };
        } catch (err: any) {
            set.status = 500
            return { error: err.message }
        }
    }, {
        body: t.Object({
            card_id: t.String(),
            rating: t.Number(),
            stability: t.Number(),
            difficulty: t.Number(),
            days_elapsed: t.Number(),
            duration_ms: t.Optional(t.Number()),
            client_request_id: t.Optional(t.String()),
            subject_id: t.Optional(t.String())
        })
    })
