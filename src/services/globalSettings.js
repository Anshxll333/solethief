const STORAGE_KEY = 'solethief.admin.global-settings.v1';

export const DEFAULT_GLOBAL_SETTINGS = {
    banner: { enabled: true, eyebrow: 'NEW DROP', title: 'THE VAULT IS OPEN', body: 'Authenticated pairs. Tokyo-sourced.', ctaLabel: 'Explore the vault', ctaHref: '/shop' },
    navigation: [{ label: 'Shop', href: '/shop', visible: true, displayOrder: 10 }, { label: 'New Drops', href: '/new-drops', visible: true, displayOrder: 20 }, { label: 'About', href: '/about', visible: true, displayOrder: 30 }],
    footer: { contactEmail: '', contactPhone: '', instagram: '', pinterest: '', shippingPolicy: '', returnsPolicy: '', privacyPolicy: '', termsPolicy: '' },
    seo: { title: 'SoleThief', description: '', imageUrl: '', canonicalUrl: '' },
    payment: {
        provider: 'razorpay',
        enabled: false,
        maintenance: false,
        maintenanceMessage: 'Razorpay online payment is currently undergoing scheduled maintenance. Please select Cash on Delivery or check back shortly.',
        mode: 'test',
        keyId: '',
        secretConfigured: false,
        webhookConfigured: false,
        title: 'Online Payment (UPI / Cards / Netbanking)',
        description: 'Instant verification via official Razorpay India payment contract. All major UPI apps, credit/debit cards, and netbanking.',
        cod: {
            enabled: true,
            maintenance: false,
            maintenanceMessage: 'Cash on Delivery is currently paused for maintenance.',
            title: 'Archive Reserve / Cash on Delivery',
            description: 'Reserve your pair immediately. Complete payment in cash or UPI upon delivery authentication inspection.',
        },
    },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function mergeSettings(value) {
    return {
        ...clone(DEFAULT_GLOBAL_SETTINGS),
        ...(value || {}),
        banner: { ...DEFAULT_GLOBAL_SETTINGS.banner, ...(value?.banner || {}) },
        footer: { ...DEFAULT_GLOBAL_SETTINGS.footer, ...(value?.footer || {}) },
        seo: { ...DEFAULT_GLOBAL_SETTINGS.seo, ...(value?.seo || {}) },
        payment: {
            ...DEFAULT_GLOBAL_SETTINGS.payment,
            ...(value?.payment || {}),
            cod: {
                ...DEFAULT_GLOBAL_SETTINGS.payment.cod,
                ...(value?.payment?.cod || {}),
            },
        },
        navigation: Array.isArray(value?.navigation) ? value.navigation : clone(DEFAULT_GLOBAL_SETTINGS.navigation),
    };
}

export function redactPaymentSettings(settings) {
    const safe = mergeSettings(settings);
    const secretConfigured = Boolean(safe.payment.secretConfigured || safe.payment.secretKey);
    return {
        ...safe,
        payment: {
            ...safe.payment,
            secretKey: undefined,
            secretConfigured,
        },
    };
}

export function createGlobalSettingsService(getRuntime, { storage = globalThis.localStorage } = {}) {
    const readRuntime = () => getRuntime ? getRuntime() : { status: 'missing', client: null };
    const previewRead = () => { try { return mergeSettings(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')); } catch { return clone(DEFAULT_GLOBAL_SETTINGS); } };
    const previewWrite = (settings) => {
        const safe = redactPaymentSettings(settings);
        storage?.setItem(STORAGE_KEY, JSON.stringify(safe));
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent('solethief:settings-updated', { detail: safe }));
            } catch {}
        }
        return safe;
    };
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
        async loadPublic() {
            const runtime = readRuntime();
            if (runtime?.status === 'missing' && !runtime.client) {
                return { settings: previewRead(), source: 'preview' };
            }
            if (runtime?.status !== 'configured' || !runtime.client) {
                return { settings: previewRead(), source: 'preview' };
            }
            try {
                const { data, error } = await runtime.client
                    .from('global_settings')
                    .select('settings')
                    .eq('id', true)
                    .maybeSingle();
                if (error || !data?.settings) {
                    return { settings: previewRead(), source: 'fallback' };
                }
                return { settings: redactPaymentSettings(data.settings), source: 'supabase' };
            } catch {
                return { settings: previewRead(), source: 'preview' };
            }
        },
        async save(settings) {
            const safe = redactPaymentSettings(settings);
            const runtime = readRuntime();
            if (runtime?.status === 'missing' && !runtime.client) return { settings: previewWrite(safe), source: 'preview' };
            if (runtime?.status !== 'configured' || !runtime.client) throw new Error(runtime?.message || 'Admin configuration is invalid.');
            await assertAdmin(runtime.client);
            const { data, error } = await runtime.client.rpc('admin_save_global_settings', { p_settings: safe });
            if (error) throw new Error(`Failed to save global settings: ${error.message}`);
            previewWrite(safe);
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
