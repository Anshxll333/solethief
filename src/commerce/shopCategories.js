export const SHOP_CATEGORIES_STORAGE_KEY = 'solethief.shop.categories.v1';
export const SHOP_UPDATE_EVENT = 'solethief:shop-updated';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Reject control characters to mirror the database text constraints.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const IMAGE = /^(https:\/\/[A-Za-z0-9]+([.-][A-Za-z0-9]+)*(:[0-9]{1,5})?(\/[A-Za-z0-9_./-]*)?|\/[A-Za-z0-9_-][A-Za-z0-9_./-]*)$/;
const SEEDS = ['Travis Scott', 'Low Dunks', 'Retro 4', 'Air Jordans', 'Leather Shoes', 'Air Forces', 'Adidas', 'New Balance', 'Limited'];

export function assertCategoryId(id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid category ID.');
    return id;
}

export function assertProductId(id) {
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new Error('Invalid product ID.');
    return id;
}

export function createCategorySlug(name, usedSlugs = []) {
    const base = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120).replace(/-$/g, '') || 'category';
    return usedSlugs.includes(base) ? `${base.slice(0, 83).replace(/-$/g, '')}-${globalThis.crypto.randomUUID()}` : base;
}

export function normalizeCategory(input, existing = null, usedSlugs = []) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Category payload is required.');
    const name = input.name;
    if (typeof name !== 'string' || name !== name.trim() || !name || [...name].length > 120 || CONTROL.test(name)) throw new Error('Invalid category name.');
    if (existing && input.slug !== undefined && input.slug !== existing.slug) throw new Error('Category slug is immutable.');
    const slug = existing?.slug ?? input.slug ?? createCategorySlug(name, usedSlugs);
    if (typeof slug !== 'string' || slug.length > 120 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid category slug.');
    const image_url = input.image_url === undefined ? null : input.image_url;
    if (image_url !== null && (typeof image_url !== 'string' || image_url.length > 2048 || CONTROL.test(image_url) || !IMAGE.test(image_url))) throw new Error('Invalid category image URL.');
    const display_order = input.display_order === undefined ? 0 : input.display_order;
    if (!Number.isInteger(display_order) || display_order < 0 || display_order > 2147483647) throw new Error('Invalid category display order.');
    const is_visible = input.is_visible === undefined ? true : input.is_visible;
    if (typeof is_visible !== 'boolean') throw new Error('Invalid category visibility.');
    const id = existing?.id ?? input.id;
    if (id !== undefined) assertCategoryId(id);
    return { ...(id === undefined ? {} : { id }), name, slug, image_url, display_order, is_visible };
}

export function sortCategories(categories) {
    return [...categories].sort((a, b) => a.display_order - b.display_order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

export function getDefaultShopCategories() {
    return SEEDS.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, name, slug: createCategorySlug(name), image_url: null, display_order: index + 1, is_visible: true }));
}

export function getShopStorage() {
    const storage = typeof window !== 'undefined' ? window.localStorage : globalThis.localStorage;
    if (!storage) throw new Error('Preview shop storage is unavailable.');
    return storage;
}

function validateStore(store) {
    if (!store || store.version !== 1 || !Array.isArray(store.categories) || !Array.isArray(store.memberships)) throw new Error('Invalid preview category store.');
    const ids = new Set();
    const slugs = new Set();
    for (const row of store.categories) {
        assertCategoryId(row?.id);
        for (const key of ['name', 'slug', 'image_url', 'display_order', 'is_visible']) {
            if (!Object.hasOwn(row, key)) throw new Error('Incomplete preview category.');
        }
        normalizeCategory(row);
        if (ids.has(row.id) || slugs.has(row.slug)) throw new Error('Duplicate preview category.');
        ids.add(row.id);
        slugs.add(row.slug);
    }
    const pairs = new Set();
    for (const row of store.memberships) {
        assertCategoryId(row?.category_id);
        assertProductId(row.product_id);
        const key = `${row.category_id}:${row.product_id}`;
        if (!ids.has(row.category_id) || pairs.has(key)) throw new Error('Invalid preview category membership.');
        pairs.add(key);
    }
    return store;
}

export function readPreviewShopCategories(storage = getShopStorage()) {
    const raw = storage.getItem(SHOP_CATEGORIES_STORAGE_KEY);
    if (raw === null) {
        const store = { version: 1, categories: getDefaultShopCategories(), memberships: [] };
        storage.setItem(SHOP_CATEGORIES_STORAGE_KEY, JSON.stringify(store));
        return store;
    }
    return validateStore(JSON.parse(raw));
}

export function notifyShopUpdated() {
    if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new Event(SHOP_UPDATE_EVENT));
}

export function writePreviewShopCategories(store, storage = getShopStorage()) {
    validateStore(store);
    storage.setItem(SHOP_CATEGORIES_STORAGE_KEY, JSON.stringify(store));
    notifyShopUpdated();
}

export function subscribeShopUpdates(callback) {
    if (typeof window === 'undefined' || !window.addEventListener) return () => { };
    const storage = event => {
        if (event.key === null || [SHOP_CATEGORIES_STORAGE_KEY, 'solethief.admin.drops.v1', 'solethief.admin.inventory.v1'].includes(event.key)) callback();
    };
    window.addEventListener(SHOP_UPDATE_EVENT, callback);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', callback);
    return () => {
        window.removeEventListener(SHOP_UPDATE_EVENT, callback);
        window.removeEventListener('storage', storage);
        window.removeEventListener('focus', callback);
    };
}
