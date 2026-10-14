import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    getConfiguredAdminEmails,
    isConfiguredAdminEmail,
    isConfiguredAdminUser,
    normalizeAuthEmail,
} from '../src/auth/adminAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('admin email matching is normalized and fails closed', () => {
    assert.equal(normalizeAuthEmail('  ADMIN@SoleThief.IN '), 'admin@solethief.in');
    assert.equal(normalizeAuthEmail(null), '');
    assert.deepEqual(
        getConfiguredAdminEmails({ VITE_ADMIN_EMAILS: ' Admin@SoleThief.in, SECOND@solethief.in,admin@solethief.in ' }),
        ['admin@solethief.in', 'second@solethief.in'],
    );
    assert.deepEqual(getConfiguredAdminEmails({ VITE_ADMIN_EMAIL: ' legacy@solethief.in ' }), ['legacy@solethief.in']);

    assert.equal(isConfiguredAdminEmail(' ADMIN@SOLETHIEF.IN ', 'admin@solethief.in'), true);
    assert.equal(isConfiguredAdminEmail('second@solethief.in', ['admin@solethief.in', 'second@solethief.in']), true);
    assert.equal(isConfiguredAdminEmail('customer@solethief.in', 'admin@solethief.in'), false);
    assert.equal(isConfiguredAdminEmail('admin@solethief.in', ''), false);
    assert.equal(isConfiguredAdminEmail('', 'admin@solethief.in'), false);
    assert.equal(isConfiguredAdminUser({ email: 'Admin@SoleThief.in' }, 'admin@solethief.in'), true);
    assert.equal(isConfiguredAdminUser(null, 'admin@solethief.in'), false);
});

test('admin route waits for auth hydration and redirects unauthorized users home', () => {
    const routeSource = readSource('src/auth/AdminRoute.jsx');
    const appSource = readSource('src/App.jsx');

    assert.ok(routeSource.includes("authStatus === 'loading'"));
    assert.ok(routeSource.includes("authStatus !== 'authenticated'"));
    assert.ok(routeSource.includes('isConfiguredAdminUser(user)'));
    assert.ok(routeSource.includes('<Navigate to="/" replace />'));
    assert.ok(appSource.includes('<AdminRoute><Admin /></AdminRoute>'));
});

test('navbar and account login share configured-admin authorization', () => {
    const navbarSource = readSource('src/components/Navbar.jsx');
    const accountSource = readSource('src/pages/Account.jsx');

    assert.ok(navbarSource.includes("authStatus === 'authenticated' && isConfiguredAdminUser(user)"));
    assert.ok(navbarSource.includes('{showAdminLink && ('));
    assert.ok(accountSource.includes('isConfiguredAdminUser(loggedInUser)'));
    assert.ok(accountSource.includes("safeReturnUrl.startsWith('/admin')"));
});
