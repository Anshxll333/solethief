const STORAGE_KEY = 'solethief.admin.new-drops-settings.v2';
const EVENT_NAME = 'solethief:new-drops-settings-updated';

export const DEFAULT_NEW_DROPS_SETTINGS = {
    badge: 'AUTHENTIC DROPS • PAN-INDIA DISPATCH',
    title: 'THE ARCHIVE DROP',
    subtitle: 'Fresh silhouettes, restocked deadstock, and high-demand grails dispatched with express speed.',
    batchLabel: 'BATCH #04',
    authLabel: '100% VERIFIED',
    announcement: {
        enabled: true,
        text: 'NEXT VAULT RELEASE: SATURDAY 11:00 AM IST • LIMITED QUANTITIES',
        link: '',
    },
    countdown: {
        enabled: false,
        label: 'DROP CLOSING IN',
        targetDate: '',
    },
    heroCoverUrl: '',
    notice: '',
};

function clone(val) {
    return JSON.parse(JSON.stringify(val));
}

function mergeSettings(val) {
    const base = clone(DEFAULT_NEW_DROPS_SETTINGS);
    if (!val || typeof val !== 'object') return base;
    return {
        ...base,
        ...val,
        announcement: {
            ...base.announcement,
            ...(val.announcement || {}),
        },
        countdown: {
            ...base.countdown,
            ...(val.countdown || {}),
        },
    };
}

export function getNewDropsSettings({ storage = globalThis.localStorage } = {}) {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) return clone(DEFAULT_NEW_DROPS_SETTINGS);
        const parsed = JSON.parse(raw);
        return mergeSettings(parsed);
    } catch (e) {
        console.warn('[newDropsSettings] Failed to parse settings from storage:', e);
        return clone(DEFAULT_NEW_DROPS_SETTINGS);
    }
}

export function saveNewDropsSettings(settings, { storage = globalThis.localStorage } = {}) {
    const safe = mergeSettings(settings);
    storage?.setItem(STORAGE_KEY, JSON.stringify(safe));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: safe }));
    }
    return safe;
}

export function resetNewDropsSettings({ storage = globalThis.localStorage } = {}) {
    const defaults = clone(DEFAULT_NEW_DROPS_SETTINGS);
    storage?.setItem(STORAGE_KEY, JSON.stringify(defaults));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: defaults }));
    }
    return defaults;
}

export function subscribeNewDropsSettings(listener) {
    if (typeof window === 'undefined') return () => { };
    const handleCustom = (e) => listener(e.detail);
    const handleStorage = (e) => {
        if (e.key === STORAGE_KEY) {
            listener(getNewDropsSettings());
        }
    };
    window.addEventListener(EVENT_NAME, handleCustom);
    window.addEventListener('storage', handleStorage);
    return () => {
        window.removeEventListener(EVENT_NAME, handleCustom);
        window.removeEventListener('storage', handleStorage);
    };
}

export { STORAGE_KEY, EVENT_NAME };
