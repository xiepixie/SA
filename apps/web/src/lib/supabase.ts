import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@v2/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

// Key for storing the persistence preference
const PERSISTENCE_KEY = 'auth_persist_session'

/**
 * Get the user's session persistence preference
 * @returns true if "remember me" is enabled (use localStorage), false for sessionStorage
 */
export const getSessionPersistence = (): boolean => {
    try {
        return localStorage.getItem(PERSISTENCE_KEY) === 'true'
    } catch {
        return false
    }
}

/**
 * Set the user's session persistence preference
 * @param persist - true to persist session across browser restarts
 */
export const setSessionPersistence = (persist: boolean): void => {
    try {
        if (persist) {
            localStorage.setItem(PERSISTENCE_KEY, 'true')
        } else {
            localStorage.removeItem(PERSISTENCE_KEY)
        }
    } catch {
        // Ignore storage errors
    }
}

/**
 * Custom storage adapter that respects the user's persistence preference
 * - When "remember me" is ON: uses localStorage (persists across browser sessions)
 * - When "remember me" is OFF: uses sessionStorage (cleared when browser closes)
 */
const createDynamicStorage = () => {
    const getStorage = (): Storage => {
        return getSessionPersistence() ? localStorage : sessionStorage
    }

    return {
        getItem: (key: string): string | null => {
            // Check both storages when retrieving (for migration/transition)
            const storage = getStorage()
            const value = storage.getItem(key)
            if (value) return value

            // Fallback: check the other storage
            const altStorage = getSessionPersistence() ? sessionStorage : localStorage
            return altStorage.getItem(key)
        },
        setItem: (key: string, value: string): void => {
            const storage = getStorage()
            storage.setItem(key, value)

            // Clean up the other storage to prevent duplicates
            const altStorage = getSessionPersistence() ? sessionStorage : localStorage
            altStorage.removeItem(key)
        },
        removeItem: (key: string): void => {
            // Remove from both storages to ensure clean logout
            localStorage.removeItem(key)
            sessionStorage.removeItem(key)
        }
    }
}

// Create the main Supabase client with dynamic storage
export const supabase: SupabaseClient<Database> = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            storage: createDynamicStorage(),
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    }
)

/**
 * Clear the session persistence preference
 * Call this on logout to ensure clean state for next login
 */
export const clearSessionPersistence = (): void => {
    try {
        localStorage.removeItem(PERSISTENCE_KEY)
    } catch {
        // Ignore storage errors
    }
}

/**
 * Migrate session to the correct storage based on current preference
 * Call this after changing the persistence preference
 */
export const migrateSessionStorage = async (): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
        // Force a session refresh to apply the new storage preference
        await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
        })
    }
}

// Listen for auth state changes to handle logout cleanup
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        // Clear the persistence preference on logout
        // This ensures the next login starts with a clean slate
        clearSessionPersistence()
    }
})
