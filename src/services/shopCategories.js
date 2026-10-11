import { getSupabaseRuntime } from '../lib/supabase.js';
import { getOperatorSession, getPreviewDrops } from '../commerce/admin.js';
import { adaptCatalogRow, previewDropToRow } from './catalog.js';
import {
    assertCategoryId, assertProductId, normalizeCategory, sortCategories,
    readPreviewShopCategories, writePreviewShopCategories, notifyShopUpdated,
} from '../commerce/shopCategories.js';

const CATEGORY_COLUMNS = 'id,name,slug,image_url,display_order,is_visible';
const PRODUCT_COLUMNS = 'id,name,brand,size,price_minor,currency,front_image,side_image,active';

async function result(query) {
    const { data, error } = await query;
    if (error) throw new Error('Shop category request failed.', { cause: error });
    return data;
}

function rows(data) {
    if (!Array.isArray(data)) throw new Error('Invalid shop response.');
    return data;
}

export function createShopCategoriesService(runtimeProvider = getSupabaseRuntime) {
    function runtime() {
        const value = runtimeProvider();
        if (value?.status === 'missing' && !value.client) return value;
        if (value?.status !== 'configured' || !value.client) throw new Error(value?.message || 'Shop configuration is invalid.');
        return value;
    }

    async function authorize(value) {
        if (value.status === 'missing') {
            // This session authorizes only a local demo, never a Supabase request.
            const session = getOperatorSession();
            if (session?.isOperator !== true || session.role !== 'admin') throw new Error('Local demo operator required.');
        } else if (await result(value.client.rpc('is_shop_admin')) !== true) {
            throw new Error('Shop administrator required.');
        }
    }

    async function categories(value) {
        return rows(await result(value.client.from('shop_categories').select(CATEGORY_COLUMNS).order('display_order').order('slug'))).map(row => {
            assertCategoryId(row?.id);
            return normalizeCategory(row);
        });
    }

    async function products(value) {
        const data = value.status === 'missing' ? getPreviewDrops().map(previewDropToRow)
            : rows(await result(value.client.from('products').select(PRODUCT_COLUMNS).order('id')));
        const adapted = data.map(row => {
            if (typeof row.active !== 'boolean') throw new Error('Invalid product active flag.');
            return { ...adaptCatalogRow(row), active: row.active };
        });
        if (new Set(adapted.map(row => row.id)).size !== adapted.length) throw new Error('Duplicate product IDs.');
        return adapted;
    }

    return {
        async list({ admin = false } = {}) {
            const value = runtime();
            if (admin) await authorize(value);
            let categoryRows;
            let memberships;
            if (value.status === 'missing') {
                const store = readPreviewShopCategories();
                categoryRows = store.categories;
                memberships = store.memberships;
            } else {
                categoryRows = await categories(value);
                memberships = rows(await result(value.client.from('shop_category_products').select('category_id,product_id')));
                memberships.forEach(row => { assertCategoryId(row?.category_id); assertProductId(row.product_id); });
            }
            if (!admin) {
                categoryRows = categoryRows.filter(row => row.is_visible);
                const visible = new Set(categoryRows.map(row => row.id));
                memberships = memberships.filter(row => visible.has(row.category_id));
                // Empty category lists must not depend on catalog availability.
                if (memberships.length) {
                    const active = new Set((await products(value)).filter(row => row.active).map(row => row.id));
                    memberships = memberships.filter(row => active.has(row.product_id));
                }
            }
            return { categories: sortCategories(categoryRows), memberships, source: value.status === 'missing' ? 'preview' : 'supabase' };
        },

        async save(category) {
            const value = runtime();
            await authorize(value);
            const store = value.status === 'missing' ? readPreviewShopCategories() : null;
            const all = store ? store.categories : await categories(value);
            const existing = category?.id === undefined ? null : all.find(row => row.id === assertCategoryId(category.id));
            if (category?.id !== undefined && !existing) throw new Error('Category not found.');
            const normalized = normalizeCategory(category, existing, all.map(row => row.slug));
            if (all.some(row => row.slug === normalized.slug && row.id !== normalized.id)) throw new Error('Category slug already exists.');
            let saved;
            if (store) {
                saved = { ...normalized, id: existing?.id ?? globalThis.crypto.randomUUID() };
                store.categories = existing ? all.map(row => row.id === saved.id ? saved : row) : [...all, saved];
                writePreviewShopCategories(store);
            } else {
                const { id: _id, slug, ...mutable } = normalized;
                const table = value.client.from('shop_categories');
                const query = existing ? table.update(mutable).eq('id', existing.id) : table.insert({ ...mutable, slug });
                saved = normalizeCategory(await result(query.select(CATEGORY_COLUMNS).single()));
                assertCategoryId(saved.id);
                notifyShopUpdated();
            }
            return saved;
        },

        async remove(id) {
            const value = runtime();
            await authorize(value);
            assertCategoryId(id);
            if (value.status === 'missing') {
                const store = readPreviewShopCategories();
                store.categories = store.categories.filter(row => row.id !== id);
                store.memberships = store.memberships.filter(row => row.category_id !== id);
                writePreviewShopCategories(store);
            } else {
                await result(value.client.from('shop_categories').delete().eq('id', id));
                notifyShopUpdated();
            }
        },

        async assign(categoryId, productId, assigned = true) {
            const value = runtime();
            await authorize(value);
            assertCategoryId(categoryId);
            assertProductId(productId);
            if (typeof assigned !== 'boolean') throw new Error('Assignment must be boolean.');
            const membership = { category_id: categoryId, product_id: productId };
            if (value.status === 'missing') {
                const store = readPreviewShopCategories();
                if (!store.categories.some(row => row.id === categoryId)) throw new Error('Category not found.');
                if (assigned && !(await products(value)).some(row => row.id === productId)) throw new Error('Product not found.');
                store.memberships = store.memberships.filter(row => row.category_id !== categoryId || row.product_id !== productId);
                if (assigned) store.memberships.push(membership);
                writePreviewShopCategories(store);
            } else {
                const table = value.client.from('shop_category_products');
                await result(assigned ? table.upsert(membership, { onConflict: 'category_id,product_id' })
                    : table.delete().eq('category_id', categoryId).eq('product_id', productId));
                notifyShopUpdated();
            }
        },

        async listProducts() {
            const value = runtime();
            await authorize(value);
            return products(value);
        },
    };
}

export const shopCategoriesService = createShopCategoriesService();
export { SHOP_UPDATE_EVENT, subscribeShopUpdates } from '../commerce/shopCategories.js';
