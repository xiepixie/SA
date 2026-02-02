import { Elysia } from 'elysia'
import { supabase } from './supabase'
import { checkETag } from './utils'
import type { User } from '@supabase/supabase-js'

/**
 * auth - Shared Authentication Plugin
 * Injects 'user' and 'checkETag' into the context.
 * Used by all feature modules to ensure consistent auth and type safety.
 * 
 * Uses 'resolve' with 'as: scoped' to ensure proper type propagation
 * to all routes that use this plugin.
 */
export const auth = new Elysia({ name: 'auth' })
    .resolve({ as: 'scoped' }, async ({ request }) => {
        const authHeader = request.headers.get('authorization')
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

        let user: User | null = null
        if (token) {
            try {
                const { data, error: authError } = await supabase.auth.getUser(token)
                if (!authError && data.user) {
                    user = data.user
                }
            } catch (err) {
                console.warn('⚠️ [Auth] Context derivation failed');
            }
        }

        return { user, checkETag }
    })
