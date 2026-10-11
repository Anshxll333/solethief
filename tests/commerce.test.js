import test from 'node:test';
import assert from 'node:assert/strict';
import { addPair, canAddPair, emptyCart, parseCart, resolveCart, subtotalMinor, MAX_PAIRS } from '../src/commerce/cart.js';
import { filterCatalog, parsePrice, parseProductId } from '../src/commerce/catalog.js';
import { adaptCatalogRow, createCatalogService } from '../src/services/catalog.js';

const preview = await createCatalogService(() => ({ status: 'missing', client: null })).list({ allowPreview: true });
const products = preview.products;

test('storage rejects malformed, oversized, wrong-version and invalid ID payloads', () => {
    for (const raw of [null, '', '{', 'null', '[]', '{}', 'x'.repeat(10001), ...[
        { version: 2, source: 'preview', ids: [1] },
        { version: 1, source: 'other', ids: [1] },
        ...[[0], [-1], [1.2], ['1'], [2147483648], [null], Array(101).fill(1)].map(ids => ({ version: 1, source: 'preview', ids })),
    ].map(JSON.stringify)]) assert.deepEqual(parseCart(raw), emptyCart());
});

test('storage strips cached prices, quantities and extra fields, deduplicates and round trips', () => {
    const cart = parseCart(JSON.stringify({ version: 1, source: 'preview', ids: [1, 1, 2], priceMinor: 1, quantity: 99 }));
    assert.deepEqual(cart, { version: 1, source: 'preview', ids: [1, 2] });
    assert.deepEqual(parseCart(JSON.stringify(cart)), cart);
});

test('single-pair additions are idempotent, bounded, and never infer live stock', () => {
    const cart = addPair(emptyCart(), products[0], 'preview');
    assert.deepEqual(cart.ids, [1]);
    assert.equal(addPair(cart, products[0], 'preview'), cart);
    assert.equal(addPair(cart, undefined, 'preview'), cart);
    for (const availability of ['available', 'reserved', 'sold', 'unavailable', undefined]) {
        assert.equal(canAddPair({ ...products[0], availability }, 'supabase'), false);
        assert.equal(addPair(cart, { ...products[0], availability }, 'supabase'), cart);
    }
    const full = { version: 1, source: 'preview', ids: Array.from({ length: MAX_PAIRS }, (_, i) => i + 1) };
    assert.equal(addPair(full, { ...products[0], id: 101 }, 'preview'), full);
});

test('missing products and mode changes remain unresolved; totals use current integer paise', () => {
    const cart = { version: 1, source: 'preview', ids: [1, 2, 99] };
    const lines = resolveCart(cart, preview);
    assert.equal(lines[2].product, undefined);
    assert.equal(lines[2].eligible, false);
    assert.equal(subtotalMinor(lines), 3750000);
    assert.ok(resolveCart(cart, { ...preview, source: 'supabase' }).every(line => !line.product && !line.eligible));
    const changed = resolveCart(cart, { ...preview, products: [{ ...products[0], priceMinor: 12345 }] });
    assert.equal(subtotalMinor(changed), 12345);
    assert.throws(() => subtotalMinor([{ product: { priceMinor: 1.1 } }]), /Invalid cart price/);
});

test('catalog search and compound filters sort without mutating source', () => {
    assert.deepEqual(filterCatalog(products, { query: ' sClAw ', size: 'US 8' }).map(p => p.id), [4]);
    assert.deepEqual(filterCatalog(products, { brand: 'SOLETHIEF RONIN', min: 1650000, max: 1650000 }).map(p => p.id), [3, 4]);
    assert.deepEqual(filterCatalog(products, { sort: 'price-asc' }).map(p => p.id), [3, 4, 2, 1]);
    assert.deepEqual(filterCatalog(products, { sort: 'price-desc' }).map(p => p.id), [1, 2, 3, 4]);
    assert.deepEqual(filterCatalog(products, { query: 'missing' }), []);
    assert.deepEqual(products.map(p => p.id), [1, 2, 3, 4]);
});

test('price inputs use exact decimal parsing; routes reject partial or unsafe IDs', () => {
    assert.equal(parsePrice('16500.01'), 1650001);
    assert.equal(parsePrice('0.1'), 10);
    assert.equal(parsePrice(''), null);
    for (const value of ['-1', '1e3', '1.001', 'abc', '21474836.48']) assert.ok(Number.isNaN(parsePrice(value)));
    assert.equal(parseProductId('4'), 4);
    for (const value of ['1abc', '1.2', '01', '-1', '0', '2147483648', undefined]) assert.equal(parseProductId(value), null);
});

test('adapter fails closed on malformed presentation, money and duplicate responses', async () => {
    const row = { id: 1, name: 'Pair', brand: 'Brand', size: 'US 9', price_minor: 100, currency: 'INR', front_image: '/front.png', side_image: '/side.png' };
    for (const bad of [null, { ...row, name: null }, { ...row, front_image: 'javascript:bad' }, { ...row, id: 2147483648 }, { ...row, price_minor: 2147483648 }]) assert.throws(() => adaptCatalogRow(bad), /Invalid catalog/);
    const service = createCatalogService(() => ({ client: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [row, row], error: null }) }) }) }) } }));
    await assert.rejects(service.list({ allowPreview: true }), /duplicate pair IDs/);
});
