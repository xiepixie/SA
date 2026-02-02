import { createClient } from '@supabase/supabase-js'

// --- ENVIRONMENT INITIALIZATION ---
const getEnv = (key: string, fallback: string): string => process.env[key] || fallback;

const supabaseUrl = getEnv('SUPABASE_URL', 'http://localhost:54321')
const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', 'your-service-role-key')

console.log('📡 [Supabase] Environment Audit:', {
    url: supabaseUrl.replace(/(https?:\/\/).*/, '$1***.supabase.co'),
    role: supabaseServiceRoleKey ? 'PRESENT' : 'MISSING',
});

// Custom fetch for Bun environment to handle SSL issues if needed
const customFetch = (url: string | URL | Request, init?: RequestInit) => {
    return fetch(url, {
        ...init,
        // @ts-ignore
        tls: { rejectUnauthorized: false }
    });
};

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    },
    global: {
        fetch: customFetch as any
    }
});

/**
 * connectivity test to ensure Supabase is reachable
 */
export async function testConnectivity() {
    try {
        const { error } = await supabase.from('subjects').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('✅ [Supabase] Connection verified.');
        return true;
    } catch (err) {
        console.error('❌ [Supabase] Connection failed:', err);
        return false;
    }
}
