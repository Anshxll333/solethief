import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalSettingsService, DEFAULT_GLOBAL_SETTINGS, redactPaymentSettings, STORAGE_KEY } from '../src/services/globalSettings.js';

const store = new Map();
const storage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) };

test('global settings preview persists and redacts payment secrets', async () => {
    const service = createGlobalSettingsService(() => ({ status: 'missing', client: null }), { storage });
    const result = await service.save({ ...DEFAULT_GLOBAL_SETTINGS, payment: { secretKey: 'never-store', keyId: 'public-id', enabled: true } });
    assert.equal(result.source, 'preview');
    assert.equal(result.settings.payment.secretKey, undefined);
    assert.equal(JSON.parse(store.get(STORAGE_KEY)).payment.secretKey, undefined);
    assert.equal((await service.load()).settings.payment.keyId, 'public-id');
});

test('live settings operations require is_shop_admin and never test payment in browser', async () => {
    const calls = [];
    const service = createGlobalSettingsService(() => ({ status: 'configured', client: { rpc: async (...args) => { calls.push(args); return args[0] === 'is_shop_admin' ? { data: true, error: null } : { data: null, error: null }; } } }));
    await service.save(DEFAULT_GLOBAL_SETTINGS);
    assert.equal(calls[0][0], 'is_shop_admin');
    const result = await service.testPaymentConnection();
    assert.equal(result.ok, false);
    assert.match(result.error, /not configured/i);
    assert.ok(!calls.some(([name]) => name.includes('secret')));
});

test('redaction preserves public configuration only', () => {
    const safe = redactPaymentSettings({ payment: { keyId: 'id', secretKey: 'secret', secretConfigured: true } });
    assert.equal(safe.payment.keyId, 'id');
    assert.equal(safe.payment.secretKey, undefined);
    assert.equal(safe.payment.secretConfigured, true);
});
