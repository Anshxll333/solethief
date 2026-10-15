import test from 'node:test';
import assert from 'node:assert/strict';
import {
    emptyWishlist,
    parseWishlist,
    addWishlistItem,
    removeWishlistItem,
    toggleWishlistItem,
    hasWishlistItem,
    resolveWishlist,
    MAX_WISHLIST_ITEMS,
    WISHLIST_KEY,
} from '../src/commerce/wishlist.js';
import { validateAddress, validateProfile } from '../src/commerce/address.js';
import { MOCK_ACCOUNTS, isAllowedAuthReturnPath, sanitizeAuthReturnPath } from '../src/auth/authConstants.js';
import { createCatalogService } from '../src/services/catalog.js';

const preview = await createCatalogService(() => ({ status: 'missing', client: null })).list({ allowPreview: true });

test('wishlist storage key matches contract', () => {
    assert.equal(WISHLIST_KEY, 'solethief.wishlist.v1');
});

test('wishlist parses and rejects malformed, oversized, or non-array payloads', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{}', 'x'.repeat(10001), ...[
        { version: 2, ids: [1] },
        { version: 1, ids: 'not-an-array' },
        ...[[0], [-1], [1.5], ['1'], [null], Array(101).fill(1)].map(ids => ({ version: 1, ids })),
    ].map(JSON.stringify)]) {
        assert.deepEqual(parseWishlist(raw), emptyWishlist());
    }
});

test('wishlist deduplicates IDs and round-trips clean objects', () => {
    const raw = JSON.stringify({ version: 1, ids: [1, 2, 2, 3, 1], extraneous: true });
    const parsed = parseWishlist(raw);
    assert.deepEqual(parsed, { version: 1, ids: [1, 2, 3] });
    assert.deepEqual(parseWishlist(JSON.stringify(parsed)), parsed);
});

test('wishlist add, remove, toggle, and hasItem operations work correctly', () => {
    let list = emptyWishlist();

    assert.equal(hasWishlistItem(list, 1), false);

    // Add product
    list = addWishlistItem(list, 1);
    assert.deepEqual(list.ids, [1]);
    assert.equal(hasWishlistItem(list, 1), true);

    // Adding existing item is idempotent
    const same = addWishlistItem(list, 1);
    assert.equal(same, list);

    // Toggle removes existing item
    list = toggleWishlistItem(list, 1);
    assert.deepEqual(list.ids, []);
    assert.equal(hasWishlistItem(list, 1), false);

    // Toggle adds missing item
    list = toggleWishlistItem(list, 2);
    assert.deepEqual(list.ids, [2]);

    // Explicit remove
    list = removeWishlistItem(list, 2);
    assert.deepEqual(list.ids, []);

    // Edge cases
    assert.equal(addWishlistItem(list, null), list);
    assert.equal(addWishlistItem(list, -5), list);
    assert.equal(removeWishlistItem(list, 'not-a-number'), list);
});

test('wishlist size is capped at MAX_WISHLIST_ITEMS', () => {
    const full = { version: 1, ids: Array.from({ length: MAX_WISHLIST_ITEMS }, (_, i) => i + 1) };
    const overflow = addWishlistItem(full, 101);
    assert.equal(overflow, full);
    assert.equal(overflow.ids.length, 100);
});

test('wishlist resolves correctly against available catalog products', () => {
    const list = { version: 1, ids: [1, 2, 999] };
    const resolved = resolveWishlist(list, preview);

    assert.equal(resolved.length, 3);
    assert.equal(resolved[0].product?.id, 1);
    assert.equal(resolved[1].product?.id, 2);
    assert.equal(resolved[2].product, undefined);
    assert.equal(resolved[2].id, 999);
});

test('address validation enforces schema requirements and constraints', () => {
    const validRaw = {
        recipient_name: '  Karan Patel  ',
        phone: '  +91 98765 43210 ',
        line1: 'Flat 402, Sneaker Loft',
        line2: '12th Cross Road',
        city: 'Bengaluru',
        region: 'Karnataka',
        postal_code: ' 560001 ',
        country_code: 'IN',
    };

    const res = validateAddress(validRaw);
    assert.equal(res.valid, true);
    assert.equal(res.clean.recipient_name, 'Karan Patel');
    assert.equal(res.clean.phone, '+91 98765 43210');
    assert.equal(res.clean.postal_code, '560001');
    assert.equal(res.clean.country_code, 'IN');

    // Missing mandatory fields
    const missing = validateAddress({});
    assert.equal(missing.valid, false);
    assert.ok(missing.errors.recipient_name);
    assert.ok(missing.errors.phone);
    assert.ok(missing.errors.line1);
    assert.ok(missing.errors.city);
    assert.ok(missing.errors.region);
    assert.ok(missing.errors.postal_code);

    // Invalid PIN codes (must be 6 numeric digits matching postgres check constraint)
    for (const badPin of ['12345', '1234567', '56000A', 'PIN560', '']) {
        const pinCheck = validateAddress({ ...validRaw, postal_code: badPin });
        assert.equal(pinCheck.valid, false);
        assert.ok(pinCheck.errors.postal_code);
    }

    // Invalid Country (must be IN)
    const badCountry = validateAddress({ ...validRaw, country_code: 'US' });
    assert.equal(badCountry.valid, false);
    assert.ok(badCountry.errors.country_code);
});

test('profile validation correctly checks display name and phone length', () => {
    assert.equal(validateProfile({ display_name: 'Rohan', phone: '+91 9876543210' }).valid, true);
    assert.equal(validateProfile({ display_name: '', phone: '' }).valid, true);

    const tooLongName = validateProfile({ display_name: 'a'.repeat(121) });
    assert.equal(tooLongName.valid, false);
    assert.ok(tooLongName.errors.display_name);

    const tooLongPhone = validateProfile({ phone: '1'.repeat(33) });
    assert.equal(tooLongPhone.valid, false);
    assert.ok(tooLongPhone.errors.phone);
});

test('mock accounts provide instant preview accounts with valid addresses', () => {
    assert.ok(MOCK_ACCOUNTS.collector);
    assert.ok(MOCK_ACCOUNTS.sneakerhead);
    assert.equal(MOCK_ACCOUNTS.collector.addresses.length > 0, true);
    for (const addr of MOCK_ACCOUNTS.collector.addresses) {
        assert.equal(validateAddress(addr).valid, true);
    }
    for (const addr of MOCK_ACCOUNTS.sneakerhead.addresses) {
        assert.equal(validateAddress(addr).valid, true);
    }
});

test('auth return path validation and sanitization protects against open redirects and supports checkout', () => {
    assert.equal(isAllowedAuthReturnPath('/checkout'), true);
    assert.equal(isAllowedAuthReturnPath('/cart'), true);
    assert.equal(isAllowedAuthReturnPath('/admin'), true);
    assert.equal(isAllowedAuthReturnPath('/shop'), true);
    assert.equal(isAllowedAuthReturnPath('/account'), true);

    // Malicious or invalid paths
    assert.equal(isAllowedAuthReturnPath('https://evil.com'), false);
    assert.equal(isAllowedAuthReturnPath('//evil.com'), false);
    assert.equal(isAllowedAuthReturnPath('/\\evil.com'), false);
    assert.equal(isAllowedAuthReturnPath('/unknown-path'), false);
    assert.equal(isAllowedAuthReturnPath(''), false);
    assert.equal(isAllowedAuthReturnPath(null), false);

    // Sanitization
    assert.equal(sanitizeAuthReturnPath('/checkout'), '/checkout');
    assert.equal(sanitizeAuthReturnPath('/checkout?step=review'), '/checkout?step=review');
    assert.equal(sanitizeAuthReturnPath('https://evil.com'), '/account');
    assert.equal(sanitizeAuthReturnPath('//evil.com', '/checkout'), '/checkout');
    assert.equal(sanitizeAuthReturnPath(null), '/account');
});

test('Account.jsx integrates 24-hour order cancellation option and modal', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const accountCode = await fs.readFile(path.resolve('src/pages/Account.jsx'), 'utf8');

    assert.ok(accountCode.includes('canCancelOrder'), 'Account.jsx must import and use canCancelOrder');
    assert.ok(accountCode.includes('orderCancelBtn'), 'Account.jsx must include orderCancelBtn');
    assert.ok(accountCode.includes('cancelModalContent'), 'Account.jsx must render cancelModalContent');
    assert.ok(accountCode.includes('handleConfirmCancelOrder'), 'Account.jsx must have cancel confirmation handler');
    assert.ok(accountCode.includes('ordersService.cancelOrder'), 'Account.jsx must delegate to ordersService.cancelOrder');
});

test('AuthContext.jsx enforces duplicate email protection and handles email rate limits gracefully', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const authCode = await fs.readFile(path.resolve('src/auth/AuthContext.jsx'), 'utf8');

    // Duplicate email protection via identities check
    assert.ok(authCode.includes('data.user.identities.length === 0'), 'AuthContext must check empty identities array for duplicate signups');
    assert.ok(authCode.includes('already exists'), 'AuthContext must report duplicate email error');

    // Rate limit friendly error
    assert.ok(authCode.includes('rate\\s*limit') || authCode.includes('rate limit') || authCode.includes('Email rate limit exceeded'), 'AuthContext must handle rate limit errors');
    assert.ok(authCode.includes('Confirm email'), 'AuthContext must advise user to turn off Confirm email in Supabase');

    // Preview mode duplicate email check
    assert.ok(authCode.includes('PREVIEW_REGISTERED_EMAILS_KEY'), 'AuthContext must use PREVIEW_REGISTERED_EMAILS_KEY');
    assert.ok(authCode.includes('isMockEmail'), 'AuthContext must verify mock emails in preview registration');
});

test('Admin.jsx grants direct console access to emails configured in .env', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const adminCode = await fs.readFile(path.resolve('src/pages/Admin.jsx'), 'utf8');

    assert.ok(adminCode.includes('isConfiguredAdminUser'), 'Admin.jsx must import and use isConfiguredAdminUser');
    assert.ok(adminCode.includes('isConfiguredAdmin = useMemo'), 'Admin.jsx must evaluate configured admin email');
    assert.ok(adminCode.includes('isAuthorized = isConfiguredAdmin || hasAccess'), 'Admin.jsx must authorize configured admin emails directly');
    assert.ok(adminCode.includes('hasConsoleAccess = isConfiguredAdmin || hasAccess'), 'Admin.jsx must grant console access to configured admin emails');
});

test('ShopCollectionsAdmin.jsx falls back to readPreviewShopCategories on RPC error', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const adminCode = await fs.readFile(path.resolve('src/pages/ShopCollectionsAdmin.jsx'), 'utf8');

    assert.ok(adminCode.includes('readPreviewShopCategories'), 'ShopCollectionsAdmin must import and use readPreviewShopCategories');
    assert.ok(adminCode.includes('getPreviewDrops'), 'ShopCollectionsAdmin must import getPreviewDrops');
});

test('CommerceProvider.jsx hydrates catalog locally for zero-latency Shop and New Drops rendering', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const providerCode = await fs.readFile(path.resolve('src/commerce/CommerceProvider.jsx'), 'utf8');
    const catalogServiceModule = await import('../src/services/catalog.js');

    assert.ok(providerCode.includes('getLocalCatalogProducts'), 'CommerceProvider must import and use getLocalCatalogProducts');
    assert.equal(typeof catalogServiceModule.getLocalCatalogProducts, 'function', 'catalog.js must export getLocalCatalogProducts');

    const localProducts = catalogServiceModule.getLocalCatalogProducts();
    assert.ok(Array.isArray(localProducts), 'getLocalCatalogProducts must return an array');
    assert.ok(localProducts.length > 0, 'getLocalCatalogProducts must have seeded or preview products');
    assert.ok(localProducts[0].id, 'First product must have valid id');
    assert.ok(localProducts[0].name, 'First product must have valid name');
});



