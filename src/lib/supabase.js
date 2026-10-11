import { createClient } from '@supabase/supabase-js';

export function readSupabaseConfig(env = {}) {
    const url = (env.VITE_SUPABASE_URL ?? '').trim();
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!url && !key) return { status: 'missing', message: 'Supabase is not configured.' };
    if (!url || !key) return { status: 'invalid', message: 'Both public Supabase URL and key are required.' };
    try {
        const parsed = new URL(url);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
        // Accept only publishable keys or legacy JWTs explicitly marked anon.
        if (!key.startsWith('sb_publishable_')) {
            const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.role !== 'anon') throw new Error();
        }
        return { status: 'configured', url, key };
    } catch {
        return { status: 'invalid', message: 'Use a valid Supabase URL and a public publishable/anon key, never a server secret.' };
    }
}

export function initializeSupabase(env = {}, factory = createClient) {
    const config = readSupabaseConfig(env);
    if (config.status !== 'configured') return { client: null, status: config.status, message: config.message };
    try {
        return {
            client: factory(config.url, config.key, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
            }),
            status: 'configured',
            message: 'Configuration present; remote connectivity is not verified.',
        };
    } catch {
        return { client: null, status: 'invalid', message: 'Supabase client initialization failed.' };
    }
}

// Lazy initialization avoids auth/storage side effects until a service actually needs it.
let runtime;
export function getSupabaseRuntime() {
    runtime ??= initializeSupabase(import.meta.env ?? {});
    return runtime;
}
