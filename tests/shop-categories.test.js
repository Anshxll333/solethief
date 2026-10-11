import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { shoesData } from '../src/data/shoes.js';
import {
    SHOP_CATEGORIES_STORAGE_KEY, SHOP_UPDATE_EVENT, getDefaultShopCategories,
    normalizeCategory, readPreviewShopCategories, writePreviewShopCategories, subscribeShopUpdates,
} from '../src/commerce/shopCategories.js';
import { createShopCategoriesService } from '../src/services/shopCategories.js';
import { createCatalogService, previewDropToRow } from '../src/services/catalog.js';
import { ADMIN_STORAGE_DROPS_KEY, ADMIN_STORAGE_OPERATOR_KEY, getPreviewDrops, savePreviewDrops } from '../src/commerce/admin.js';

const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const missing = () => ({ status: 'missing', client: null });
const service = () => createShopCategoriesService(missing);
beforeEach(() => {
    values.clear();
    globalThis.window = new EventTarget();
    window.localStorage = storage;
});

function liveMock({ admin = true, error = null, categories = getDefaultShopCategories(), memberships = [], products = [] } = {}) {
    const calls = [];
    const client = {
        async rpc(...args) { calls.push(['rpc', ...args]); return { data: admin, error }; },
        from(table) {
            calls.push(['from', table]);
            let data = table === 'shop_categories' ? categories : table === 'products' ? products : memberships;
            const query = {
                select() { return query; }, order() { return query; }, eq(...args) { calls.push(['eq', ...args]); return query; },
                insert(payload) { calls.push(['insert', payload]); data = { ...payload, id: categories[0].id }; return query; },
                update(payload) { calls.push(['update', payload]); data = { ...categories[0], ...payload }; return query; },
                delete() { calls.push(['delete']); return query; },
                upsert(payload) { calls.push(['upsert', payload]); return query; },
                single() { return query; },
                then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
            };
            return query;
        },
    };
    return { calls, service: createShopCategoriesService(() => ({ status: 'configured', client })) };
}

test('nine exact ordered seeds, zero memberships, persisted once; empty remains empty', async () => {
    const first = await service().list();
    assert.equal(first.source, 'preview');
    assert.deepEqual(first.categories.map(row => row.name), ['Travis Scott', 'Low Dunks', 'Retro 4', 'Air Jordans', 'Leather Shoes', 'Air Forces', 'Adidas', 'New Balance', 'Limited']);
    assert.deepEqual(first.categories.map(row => row.display_order), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(first.memberships, []);
    assert.deepEqual(await service().list(), first);
    for (const row of first.categories) await service().remove(row.id);
    assert.deepEqual((await service().list()).categories, []);
    assert.deepEqual(readPreviewShopCategories().memberships, []);
});

test('validation follows migration constraints and rejects unsafe images', () => {
    const valid = { name: 'Category', image_url: '/shoes/image-1.png', display_order: 2147483647, is_visible: false };
    assert.equal(normalizeCategory(valid).slug, 'category');
    for (const image_url of ['//evil.test/a', 'http://example.com/a', 'https://user@example.com/a', '/a%20b', '/a?b', '/a#b', '/a\\b', 'data:image/png,a', '', '/a\n']) {
        assert.throws(() => normalizeCategory({ ...valid, image_url }), /image/);
    }
    assert.equal(normalizeCategory({ ...valid, image_url: 'https://cdn.example.com:443/a.png' }).image_url, 'https://cdn.example.com:443/a.png');
    for (const patch of [{ name: '' }, { name: ' padded ' }, { name: 'a\u0000' }, { name: 'a'.repeat(121) }, { slug: 'bad_slug' }, { display_order: -1 }, { display_order: 1.5 }, { display_order: 2147483648 }, { is_visible: 'false' }]) {
        assert.throws(() => normalizeCategory({ ...valid, ...patch }));
    }
});

test('save generates unique UUID-suffixed slugs, persists edits, and keeps slugs immutable', async () => {
    const first = await service().save({ name: 'New Name' });
    const second = await service().save({ name: 'New Name' });
    assert.equal(first.slug, 'new-name');
    assert.match(second.slug, /^new-name-[0-9a-f-]{36}$/);
    const renamed = await service().save({ ...first, name: 'Renamed', display_order: 0 });
    assert.equal(renamed.slug, first.slug);
    assert.equal((await service().list()).categories[0].name, 'Renamed');
    await assert.rejects(service().save({ ...renamed, slug: 'changed' }), /immutable/);
    assert.equal((await service().list()).categories.length, 11);
});

test('corrupt and wrong-version stores fail without overwrite; read/write errors propagate', async () => {
    for (const raw of ['', '{', 'null', '[]', JSON.stringify({ version: 2, categories: [], memberships: [] }), JSON.stringify({ version: 1, categories: [{}], memberships: [] })]) {
        values.set(SHOP_CATEGORIES_STORAGE_KEY, raw);
        await assert.rejects(service().list());
        assert.equal(values.get(SHOP_CATEGORIES_STORAGE_KEY), raw);
    }
    values.clear();
    window.localStorage = { getItem() { throw new Error('read denied'); } };
    await assert.rejects(service().list(), /read denied/);
    window.localStorage = { getItem: () => null, setItem() { throw new Error('quota'); } };
    await assert.rejects(service().list(), /quota/);
    assert.throws(() => writePreviewShopCategories({ version: 1, categories: [], memberships: [] }), /quota/);
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('disabled'); } });
    assert.throws(() => getPreviewDrops(), /disabled/);
});

test('public categories do not read corrupt products without memberships', async () => {
    values.set(ADMIN_STORAGE_DROPS_KEY, '{');
    assert.equal((await service().list()).categories.length, 9);
    await assert.rejects(service().listProducts());
    const live = liveMock();
    assert.equal((await live.service.list()).categories.length, 9);
    assert.ok(!live.calls.some(call => call[1] === 'products'));
});

test('membership is explicit, idempotent, visible + active only, never inventory-filtered', async () => {
    const category = (await service().list()).categories[0];
    await service().assign(category.id, 3);
    await service().assign(category.id, 3);
    assert.equal((await service().list()).memberships.length, 1);
    const drops = getPreviewDrops();
    savePreviewDrops(drops.map(row => row.id === 3 ? { ...row, active: false } : row));
    assert.equal((await service().list()).memberships.length, 0);
    assert.equal((await service().list({ admin: true })).memberships.length, 1);
    savePreviewDrops(drops);
    await service().save({ ...category, is_visible: false });
    assert.equal((await service().list()).memberships.length, 0);
    await service().assign(category.id, 3, false);
    assert.equal((await service().list({ admin: true })).memberships.length, 0);
    await assert.rejects(service().assign(category.id, 999), /Product not found/);
    await service().assign(category.id, 1);
    await service().remove(category.id);
    assert.equal(readPreviewShopCategories().memberships.length, 0);
});

test('all admin operations require current RPC authorization, never a caller role', async () => {
    const id = getDefaultShopCategories()[0].id;
    for (const admin of [false, null, 'true']) {
        const live = liveMock({ admin });
        for (const action of [s => s.list({ admin: true, role: 'admin' }), s => s.save({ name: 'X', role: 'admin' }), s => s.remove(id), s => s.assign(id, 1), s => s.listProducts()]) {
            await assert.rejects(action(live.service), /administrator/);
        }
        assert.equal(live.calls.length, 5);
        live.calls.forEach(call => assert.deepEqual(call, ['rpc', 'is_shop_admin']));
    }
    values.set(ADMIN_STORAGE_OPERATOR_KEY, JSON.stringify({ isOperator: false, role: 'admin' }));
    await assert.rejects(service().save({ name: 'X' }), /operator/);
    assert.equal((await service().list()).categories.length, 9);
});

test('invalid configuration, configured client failures, and RPC failures never fall back', async () => {
    for (const runtime of [{ status: 'invalid', client: null }, { status: 'configured', client: null }, { status: 'invalid', client: {} }]) {
        await assert.rejects(createShopCategoriesService(() => runtime).list());
        await assert.rejects(createCatalogService(() => runtime).list({ allowPreview: true }));
    }
    const live = liveMock({ error: { message: 'offline' } });
    await assert.rejects(live.service.list(), /request failed/);
    await assert.rejects(live.service.save({ name: 'X' }), /request failed/);
    assert.equal(values.size, 0);
});

test('live writes omit immutable columns and picker returns camelCase with active', async () => {
    const category = getDefaultShopCategories()[0];
    const live = liveMock({ products: getPreviewDrops().map(previewDropToRow) });
    const saved = await live.service.save({ ...category, name: 'Updated' });
    assert.equal(saved.slug, category.slug);
    const patch = live.calls.find(call => call[0] === 'update')[1];
    assert.deepEqual(Object.keys(patch).sort(), ['display_order', 'image_url', 'is_visible', 'name']);
    const picker = await live.service.listProducts();
    assert.equal(picker[0].active, true);
    assert.equal(picker[0].frontImage, shoesData[0].frontImage);
    await live.service.assign(category.id, 1);
    await live.service.remove(category.id);
    assert.equal(live.calls.filter(call => call[0] === 'rpc').length, 4);
});

test('public live results explicitly filter admin-readable hidden and inactive memberships', async () => {
    const categories = getDefaultShopCategories();
    categories[1].is_visible = false;
    const products = getPreviewDrops().map(previewDropToRow);
    products[1].active = false;
    const live = liveMock({
        categories, products, memberships: [
            { category_id: categories[0].id, product_id: 1 },
            { category_id: categories[0].id, product_id: 2 },
            { category_id: categories[1].id, product_id: 3 },
        ]
    });
    const publicList = await live.service.list();
    assert.equal(publicList.categories.length, 8);
    assert.deepEqual(publicList.memberships, [{ category_id: categories[0].id, product_id: 1 }]);
    assert.ok(!live.calls.some(call => call[1] === 'inventory_pairs'));
});

test('preview catalog preserves defaults/physics, reflects edits, and ignores category visibility', async () => {
    const catalog = createCatalogService(missing);
    const initial = await catalog.list({ allowPreview: true });
    assert.deepEqual(initial.products.map(row => row.physics), shoesData.map(row => row.physics));
    assert.deepEqual(initial.products.map(row => row.priceMinor), [1900000, 1850000, 1650000, 1650000]);
    const drops = getPreviewDrops();
    savePreviewDrops(drops.map(row => ({ ...row, name: 'Edited', active: row.id !== 2 })));
    for (const row of (await service().list()).categories) await service().remove(row.id);
    const edited = await catalog.list({ allowPreview: true });
    assert.deepEqual(edited.products.map(row => row.id), [1, 3, 4]);
    assert.ok(edited.products.every(row => row.name === 'Edited'));
    savePreviewDrops([]);
    assert.deepEqual((await catalog.list({ allowPreview: true })).products, []);
    values.set(ADMIN_STORAGE_DROPS_KEY, '{');
    await assert.rejects(catalog.list({ allowPreview: true }));
    assert.equal(values.get(ADMIN_STORAGE_DROPS_KEY), '{');
    window.localStorage = { setItem() { throw new Error('quota'); } };
    assert.throws(() => savePreviewDrops(drops), /quota/);
});

test('same-tab, cross-tab, and focus subscriptions notify and clean up', async () => {
    let count = 0;
    const cleanup = subscribeShopUpdates(() => count++);
    await service().save({ name: 'Event' });
    savePreviewDrops(getPreviewDrops());
    assert.equal(count, 2);
    window.dispatchEvent(new Event('focus'));
    const event = new Event('storage');
    event.key = SHOP_CATEGORIES_STORAGE_KEY;
    window.dispatchEvent(event);
    assert.equal(count, 4);
    cleanup();
    window.dispatchEvent(new Event(SHOP_UPDATE_EVENT));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(event);
    assert.equal(count, 4);
});
