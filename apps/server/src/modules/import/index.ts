import { Elysia, t } from 'elysia'
import { runImportPipeline } from '../../services/importService'
import { auth } from '../../lib/auth'

export const importer = new Elysia({ prefix: '/import' })
    .use(auth)
    /**
     * POST /import - Main entry point for data import pipeline
     */
    .post('/', async ({ user, body, set }) => {
        if (!user) {
            set.status = 401
            return { error: 'Unauthorized' }
        }
        try {
            const result = await runImportPipeline(body as any);
            return result;
        } catch (err: any) {
            set.status = 500
            return {
                success: 0,
                failed: body.items?.length || 0,
                rowErrors: [{ row: 0, error: err.message || String(err) }],
                insertedIds: [],
                importBatchId: ''
            }
        }
    }, {
        body: t.Object({
            userId: t.String(),
            items: t.Array(t.Any()),
            config: t.Optional(t.Any())
        })
    })
