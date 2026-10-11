export const AUTH_PREVIEW_KEY = 'solethief.auth.preview.v1';
export const DEFAULT_ADDR_KEY = 'solethief.default_address.v1';

export const MOCK_ACCOUNTS = {
    collector: {
        id: 'usr_preview_arjun_01',
        email: 'collector@solethief.in',
        profile: {
            id: 'usr_preview_arjun_01',
            display_name: 'Arjun Rao',
            phone: '+91 98200 12345',
        },
        addresses: [
            {
                id: 'addr_preview_01',
                user_id: 'usr_preview_arjun_01',
                recipient: 'Arjun Rao',
                phone: '+91 98200 12345',
                line1: 'Flat 402, Sea View Apartments',
                line2: 'Carter Road, Bandra West',
                city: 'Mumbai',
                region: 'Maharashtra',
                postal_code: '400050',
                country_code: 'IN',
                created_at: '2026-01-15T10:00:00Z',
            },
        ],
    },
    sneakerhead: {
        id: 'usr_preview_priya_02',
        email: 'priya@solethief.in',
        profile: {
            id: 'usr_preview_priya_02',
            display_name: 'Priya Sharma',
            phone: '+91 98450 67890',
        },
        addresses: [
            {
                id: 'addr_preview_02',
                user_id: 'usr_preview_priya_02',
                recipient: 'Priya Sharma',
                phone: '+91 98450 67890',
                line1: '12, Indiranagar 100 Feet Road',
                line2: 'Near HAL 2nd Stage',
                city: 'Bengaluru',
                region: 'Karnataka',
                postal_code: '560038',
                country_code: 'IN',
                created_at: '2026-02-10T12:30:00Z',
            },
        ],
    },
};

export const ALLOWED_AUTH_RETURN_PATHS = ['/admin', '/checkout', '/cart', '/shop', '/account'];

export function isAllowedAuthReturnPath(returnUrl) {
    if (!returnUrl || typeof returnUrl !== 'string') return false;
    const trimmed = returnUrl.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return false;
    try {
        const parsed = new URL(trimmed, 'https://solethief.local');
        return ALLOWED_AUTH_RETURN_PATHS.includes(parsed.pathname);
    } catch {
        return false;
    }
}

export function sanitizeAuthReturnPath(returnUrl, fallback = '/account') {
    if (!returnUrl || typeof returnUrl !== 'string') return fallback;
    const trimmed = returnUrl.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) return fallback;
    try {
        const parsed = new URL(trimmed, 'https://solethief.local');
        if (ALLOWED_AUTH_RETURN_PATHS.includes(parsed.pathname)) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        return fallback;
    }
    return fallback;
}
