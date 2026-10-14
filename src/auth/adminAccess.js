export function normalizeAuthEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function getConfiguredAdminEmails(env = import.meta.env ?? {}) {
    const configured = env.VITE_ADMIN_EMAILS ?? env.VITE_ADMIN_EMAIL ?? '';
    const values = Array.isArray(configured) ? configured : String(configured).split(',');
    return [...new Set(values.map(normalizeAuthEmail).filter(Boolean))];
}

export function isConfiguredAdminEmail(email, configuredEmails = getConfiguredAdminEmails()) {
    const normalizedEmail = normalizeAuthEmail(email);
    const allowlist = Array.isArray(configuredEmails)
        ? configuredEmails.map(normalizeAuthEmail).filter(Boolean)
        : String(configuredEmails).split(',').map(normalizeAuthEmail).filter(Boolean);
    return Boolean(normalizedEmail && allowlist.includes(normalizedEmail));
}

export function isConfiguredAdminUser(user, configuredEmails = getConfiguredAdminEmails()) {
    return Boolean(user && isConfiguredAdminEmail(user.email, configuredEmails));
}
