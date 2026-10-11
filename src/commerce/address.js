export const POSTAL_CODE_REGEX = /^[0-9]{6}$/;

export function validateAddress(raw = {}) {
    const errors = {};

    const rawRecipient = raw.recipient ?? raw.recipient_name ?? raw.recipientName;
    const recipient = typeof rawRecipient === 'string' ? rawRecipient.trim() : '';
    if (!recipient || recipient.length < 1 || recipient.length > 120) {
        errors.recipient = 'Recipient name is required (1 to 120 characters).';
        errors.recipient_name = errors.recipient;
    }

    const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
    if (!phone || phone.length < 1 || phone.length > 32) {
        errors.phone = 'Phone number is required (1 to 32 characters).';
    }

    const line1 = typeof raw.line1 === 'string' ? raw.line1.trim() : '';
    if (!line1 || line1.length < 1 || line1.length > 200) {
        errors.line1 = 'Address line 1 is required (1 to 200 characters).';
    }

    const line2 = raw.line2 !== undefined && raw.line2 !== null ? String(raw.line2).trim() : '';
    if (line2.length > 200) {
        errors.line2 = 'Address line 2 must not exceed 200 characters.';
    }

    const city = typeof raw.city === 'string' ? raw.city.trim() : '';
    if (!city || city.length < 1 || city.length > 100) {
        errors.city = 'City is required (1 to 100 characters).';
    }

    const region = typeof raw.region === 'string' ? raw.region.trim() : '';
    if (!region || region.length < 1 || region.length > 100) {
        errors.region = 'State / Region is required (1 to 100 characters).';
    }

    const postalCode = typeof raw.postal_code === 'string'
        ? raw.postal_code.trim()
        : typeof raw.postalCode === 'string'
            ? raw.postalCode.trim()
            : '';
    if (!POSTAL_CODE_REGEX.test(postalCode)) {
        errors.postal_code = 'Postal PIN code must be exactly 6 digits.';
    }

    const countryCode = (raw.country_code || raw.countryCode || 'IN').toUpperCase().trim();
    if (countryCode !== 'IN') {
        errors.country_code = 'Shipping is currently supported in India only (IN).';
    }

    const normalized = {
        recipient,
        recipient_name: recipient,
        phone,
        line1,
        line2: line2 || null,
        city,
        region,
        postal_code: postalCode,
        country_code: 'IN',
        is_default: Boolean(raw.is_default ?? raw.isDefault ?? false),
    };

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        normalized,
        clean: normalized,
    };
}

export function validateProfile(raw = {}) {
    const errors = {};

    const displayName = typeof raw.display_name === 'string'
        ? raw.display_name.trim()
        : typeof raw.displayName === 'string'
            ? raw.displayName.trim()
            : '';
    if (displayName.length > 120) {
        errors.display_name = 'Display name must not exceed 120 characters.';
    }

    const phone = raw.phone !== undefined && raw.phone !== null ? String(raw.phone).trim() : '';
    if (phone.length > 32) {
        errors.phone = 'Phone must not exceed 32 characters.';
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        normalized: {
            display_name: displayName,
            phone: phone || null,
        },
    };
}
