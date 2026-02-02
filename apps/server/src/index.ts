import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { supabase, testConnectivity } from './lib/supabase'
import { checkETag } from './lib/utils'

// Import Modules
import { questions } from './modules/questions'
import { subjects } from './modules/subjects'
import { tags } from './modules/tags'
import { study } from './modules/study'
import { importer } from './modules/import'
import { audit } from './modules/audit'
import { notes } from './modules/notes'

const app = new Elysia()
    .use(cors())
    .use(openapi({
        documentation: {
            info: {
                title: 'Smart Archive API v6',
                version: '6.0.0',
                description: 'Modular B.E.R.R.S. Stack Backend'
            }
        }
    }))
    .get('/health', () => ({ status: 'healthy', timestamp: new Date().toISOString() }))

    // Auth & Context Middleware
    .derive(async ({ request }) => {
        const auth = request.headers.get('authorization')
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

        let user: any = null
        if (token) {
            try {
                const { data, error } = await supabase.auth.getUser(token)
                if (!error && data.user) {
                    user = data.user
                }
            } catch (err) {
                console.warn('⚠️ [Auth] Context derivation failed');
            }
        }

        return { user, checkETag }
    })

    // Register Modules
    .group('/api/v1', app => app
        .use(questions)
        .use(notes)
        .use(study)
        .group('/manage', app => app
            .get('/', async ({ user, set }) => {
                if (!user) {
                    set.status = 401
                    return { error: 'Unauthorized' }
                }

                // Fetch subjects with question/card counts (same pattern as /subjects module)
                const [subjectsRes, tagsRes] = await Promise.all([
                    supabase
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
                        .order('name'),
                    supabase
                        .from('tags')
                        .select('*, usage_count:error_question_tags(count)')
                        .eq('user_id', user.id)
                        .is('deleted_at', null)
                        .order('name')
                ]);

                // Transform subjects with counts
                const subjects = (subjectsRes.data || []).map(s => {
                    const questions = (s as any).error_questions || [];
                    const cardCount = questions.reduce((acc: number, q: any) => {
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

                // Transform tags with nodeCount
                const tags = (tagsRes.data || []).map(t => {
                    const usageData = Array.isArray(t.usage_count) ? t.usage_count[0] : (t.usage_count || {});
                    return {
                        id: t.id,
                        name: t.name,
                        color: t.color,
                        nodeCount: usageData.count || 0,
                        updatedAt: t.updated_at,
                        seq: new Date(t.updated_at).getTime(),
                        type: 'tag'
                    };
                });

                return {
                    items: [...subjects, ...tags],
                    serverTime: new Date().toISOString()
                };
            })
            .use(subjects)
            .use(tags)
            .use(audit)
        )

        .use(importer)
    )



    .listen(3001)

// --- Maintenance & Background Tasks ---

async function runPurgeWorker() {
    try {
        console.log('--- Purge Worker: Cleaning old signals ---')
        const { data, error } = await supabase.rpc('purge_realtime_signals', { p_days_threshold: 1 })
        if (error) throw error;
        console.log(`✅ Purged ${data} signals`)
        setTimeout(runPurgeWorker, 60 * 60 * 1000)
    } catch (err) {
        console.error('❌ Purge Worker failed, retrying in 1m');
        setTimeout(runPurgeWorker, 60 * 1000)
    }
}

// Startup
testConnectivity().then(ok => {
    if (ok) runPurgeWorker();
});

console.log(`🦊 Elysia v6 is running at ${app.server?.hostname}:${app.server?.port}`)

export type App = typeof app
export { supabase }