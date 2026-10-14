const STORAGE_KEY = 'solethief.admin.global-settings.v1';

export const DEFAULT_GLOBAL_SETTINGS = {
    banner: { enabled: true, eyebrow: 'NEW DROP', title: 'THE VAULT IS OPEN', body: 'Authenticated pairs. Tokyo-sourced.', ctaLabel: 'Explore the vault', ctaHref: '/shop' },
    navigation: [{ label: 'Shop', href: '/shop', visible: true, displayOrder: 10 }, { label: 'New Drops', href: '/new-drops', visible: true, displayOrder: 20 }, { label: 'About', href: '/about', visible: true, displayOrder: 30 }],
    footer: { contactEmail: '', contactPhone: '', instagram: '', pinterest: '', shippingPolicy: '', returnsPolicy: '', privacyPolicy: '', termsPolicy: '' },
    seo: { title: 'SoleThief', description: '', imageUrl: '', canonicalUrl: '' },
    payment: { provider: 'razorpay', enabled: false, keyId: '', secretConfigured: false, webhookConfigured: false },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function mergeSettings(value) { return { ...clone(DEFAULT_GLOBAL_SETTINGS), ...(value || {}), banner: { ...DEFAULT_GLOBAL_SETTINGS.banner, ...(value?.banner || {}) }, footer: { ...DEFAULT_GLOBAL_SETTINGS.footer, ...(value?.footer || {}) }, seo: { ...DEFAULT_GLOBAL_SETTINGS.seo, ...(value?.seo || {}) }, payment: { ...DEFAULT_GLOBAL_SETTINGS.payment, ...(value?.payment || {}) }, navigation: Array.isArray(value?.navigation) ? value.navigation : clone(DEFAULT_GLOBAL_SETTINGS.navigation) }; }

export function redactPaymentSettings(settings) {
    const safe = mergeSettings(settings);
    return { ...safe, payment: { ...safe.payment, secretKey: undefined, secretConfigured: Boolean(safe.payment.secretConfigured) } };
}

export function createGlobalSettingsService(getRuntime, { storage = globalThis.localStorage } = {}) {
    const readRuntime = () => getRuntime();
    const previewRead = () => { try { return mergeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')); } catch { return clone(DEFAULT_GLOBAL_SETTINGS); } };
    const previewWrite = (settings) => { const safe = redactPaymentSettings(settings); storage?.setItem(STORAGE_KEY, JSON.stringify(safe)); return safe; };
    const assertAdmin = async (client) => { const { data, error } = await client.rpc('is_shop_admin'); if (error || data !== true) throw new Error(error?.message || 'Shop administrator required.'); };
    return {
        async load() {
            const runtime = readRuntime();
            if (runtime?.status === 'missing' && !runtime.client) return { settings: previewRead(), source: 'preview' };
            if (runtime?.status !== 'configured' || !runtime.client) throw new Error(runtime?.message || 'Admin configuration is invalid.');
            await assertAdmin(runtime.client);
            const { data, error } = await runtime.client.rpc('admin_get_global_settings');
            if (error) throw new Error(`Failed to load global settings: ${error.message}`);
            return { settings: redactPaymentSettings(data || DEFAULT_GLOBAL_SETTINGS), source: 'supabase' };
        },
        async save(settings) {
            const safe = redactPaymentSettings(settings);
            const runtime = readRuntime();
            if (runtime?.status === 'missing' && !runtime.client) return { settings: previewWrite(safe), source: 'preview' };
            if (runtime?.status !== 'configured' || !runtime.client) throw new Error(runtime?.message || 'Admin configuration is invalid.');
            await assertAdmin(runtime.client);
            const { data, error } = await runtime.client.rpc('admin_save_global_settings', { p_settings: safe });
            if (error) throw new Error(`Failed to save global settings: ${error.message}`);
            return { settings: redactPaymentSettings(data || safe), source: 'supabase' };
        },
        async testPaymentConnection() {
            const runtime = readRuntime();
            if (runtime?.status !== 'configured' || !runtime.client) return { ok: false, error: 'Server-side payment test is unavailable in preview mode.' };
            await assertAdmin(runtime.client);
            const { data, error } = await runtime.client.rpc('admin_test_payment_connection');
            if (error || !data) return { ok: false, error: 'Protected server-side payment test is not configured.' };
            return data;
        },
    };
}

export { STORAGE_KEY };
