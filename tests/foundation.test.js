import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readSupabaseConfig, initializeSupabase } from '../src/lib/supabase.js';
import { createCatalogService, adaptCatalogRow } from '../src/services/catalog.js';
import { shoesData } from '../src/data/shoes.js';

const configured = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only' };
const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('missing and malformed configuration never create a client or leak credentials', () => {
    assert.equal(initializeSupabase({}).status, 'missing');
    for (const env of [
        { VITE_SUPABASE_URL: configured.VITE_SUPABASE_URL },
        { ...configured, VITE_SUPABASE_URL: 'invalid' },
        { ...configured, VITE_SUPABASE_URL: 'http://remote.example' },
        { ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_public' },
        { ...configured, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') },
    ]) {
        const result = initializeSupabase(env, () => assert.fail('must not initialize'));
        assert.equal(result.status, 'invalid');
        assert.equal(result.client, null);
        assert.ok(!JSON.stringify(result).includes(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'never_public'));
    }
});

test('installed client factory contract accepts publishable and legacy anon configuration', () => {
    assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: configured.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: jwt('anon') }).status, 'configured');
    const result = initializeSupabase(configured, (url, key, options) => {
        assert.equal(url, configured.VITE_SUPABASE_URL);
        assert.equal(key, configured.VITE_SUPABASE_PUBLISHABLE_KEY);
        assert.equal(options.auth.detectSessionInUrl, false);
        return { marker: true };
    });
    assert.equal(result.client.marker, true);
    assert.equal(initializeSupabase(configured, () => { throw new Error('sensitive detail'); }).status, 'invalid');
});

test('preview requires explicit opt-in and preserves static presentation', async () => {
    const service = createCatalogService(() => initializeSupabase({}));
    await assert.rejects(service.list(), /not configured/);
    const result = await service.list({ allowPreview: true });
    assert.equal(result.source, 'preview');
    assert.equal(result.checkoutEnabled, false);
    for (const [index, product] of result.products.entries()) {
        assert.deepEqual(product, { ...shoesData[index], priceMinor: [1900000, 1850000, 1650000, 1650000][index], currency: 'INR' });
        assert.ok(existsSync(`public${product.frontImage}`));
        assert.ok(existsSync(`public${product.sideImage}`));
    }
    result.products[0].physics.mass = 999;
    assert.equal(shoesData[0].physics.mass, 5);
    await assert.rejects(createCatalogService(() => ({ status: 'invalid', client: null, message: 'invalid config' })).list({ allowPreview: true }), /invalid config/);
});

function mockRuntime(response) {
    return () => ({
        client: {
            from(table) {
                assert.equal(table, 'products');
                return {
                    select(columns) {
                        assert.ok(!columns.includes('*'));
                        return {
                            eq(column, value) {
                                assert.equal(column, 'active'); assert.equal(value, true);
                                return { order(column) { assert.equal(column, 'id'); return Promise.resolve(response); } };
                            }
                        };
                    }
                };
            }
        }
    });
}

test('live catalog maps rows; failures and empty catalog never become preview', async () => {
    const row = { id: 1, name: shoesData[0].name, brand: shoesData[0].brand, size: 'US 9', price_minor: 1900000, currency: 'INR', front_image: shoesData[0].frontImage, side_image: shoesData[0].sideImage };
    const result = await createCatalogService(mockRuntime({ data: [row], error: null })).list();
    assert.equal(result.source, 'supabase');
    assert.equal(result.checkoutEnabled, false);
    assert.equal(result.products[0].price, '19,000.00');
    assert.deepEqual((await createCatalogService(mockRuntime({ data: [], error: null })).list()).products, []);
    await assert.rejects(createCatalogService(mockRuntime({ data: null, error: { message: 'offline' } })).list({ allowPreview: true }), /Live catalog request failed/);
    await assert.rejects(createCatalogService(mockRuntime({ data: null, error: null })).list(), /Invalid live catalog/);
    assert.throws(() => adaptCatalogRow({ ...row, price_minor: 1.5 }), /Invalid catalog/);
});

test('seed matches all existing catalog IDs, strings, sizes, images and integer paise', () => {
    const seed = readFileSync(new URL('../supabase/migrations/202610100002_catalog_seed.sql', import.meta.url), 'utf8');
    for (const shoe of shoesData) {
        const minor = Math.round(Number(shoe.price.replaceAll(',', '')) * 100);
        assert.ok(seed.includes(`(${shoe.id}, '${shoe.name}', '${shoe.brand}', '${shoe.size}', ${minor}, 'INR', '${shoe.frontImage}', '${shoe.sideImage}', true)`));
        assert.ok(seed.includes(`(${shoe.id}, 'unavailable')`));
    }
});
