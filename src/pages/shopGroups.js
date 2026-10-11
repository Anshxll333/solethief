export function groupShopProducts(products) {
    const groups = new Map();
    for (const product of products) {
        const brand = product.brand?.trim().replace(/\s+/g, ' ') || '';
        // Keep the complete brand as the key so unrelated labels never share a group.
        const key = brand.toLowerCase();
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                label: brand.replace(/^SOLETHIEF\s+/i, '') || 'Other pairs',
                products: [],
                image: '',
            });
        }
        const group = groups.get(key);
        group.products.push(product);
        if (!group.image) group.image = product.sideImage || product.frontImage || '';
    }
    return [...groups.values()];
}

export function shopGroupLocation(searchParams, groupKey = null) {
    const next = new URLSearchParams(searchParams);
    next.delete('group');
    if (groupKey !== null) next.set('group', groupKey);
    const search = next.toString();
    return `/shop${search ? `?${search}` : ''}`;
}

export function findShopCategory(categories, slug) {
    if (!slug || !Array.isArray(categories)) return null;
    const normalized = String(slug).trim().toLowerCase();
    return categories.find(c => c && typeof c.slug === 'string' && c.slug.toLowerCase() === normalized) || null;
}

export function getCategoryProducts(category, memberships, products) {
    if (!category || !category.id || !Array.isArray(memberships) || !Array.isArray(products)) return [];
    const productIds = new Set(
        memberships
            .filter(m => m && String(m.category_id) === String(category.id))
            .map(m => String(m.product_id))
    );
    return products.filter(p => p && (productIds.has(p.id) || productIds.has(String(p.id))));
}

export function resolveCategorySelection({ categories = [], memberships = [], products = [], slug = '', hiddenCategories = [] } = {}) {
    if (!slug) {
        return { state: 'directory', category: null, products: [] };
    }
    const visibleCategory = findShopCategory(categories, slug);
    if (visibleCategory) {
        if (visibleCategory.is_visible === false) {
            return { state: 'hidden', category: visibleCategory, products: [] };
        }
        const categoryProducts = getCategoryProducts(visibleCategory, memberships, products);
        if (categoryProducts.length === 0) {
            return { state: 'empty', category: visibleCategory, products: [] };
        }
        return { state: 'ready', category: visibleCategory, products: categoryProducts };
    }
    const hiddenCategory = findShopCategory(hiddenCategories, slug);
    if (hiddenCategory) {
        return { state: 'hidden', category: hiddenCategory, products: [] };
    }
    return { state: 'unavailable', category: null, products: [] };
}

export const DEFAULT_COLLECTION_ARTWORK = Object.freeze({
    'new-balance': '/shoes/transparent/new-balance.png',
    'adidas': '/shoes/transparent/adidas.png',
});

/**
 * Resolves artwork for a collection category.
 * Custom uploaded image (base64 or custom URL / link) ALWAYS takes priority over default/fallback artwork.
 */
export function resolveCollectionArtwork(category) {
    if (!category) return null;
    const custom = typeof category === 'string'
        ? category
        : (category.image_url || category.artwork_url || '');
    if (custom && typeof custom === 'string' && custom.trim()) {
        return custom.trim();
    }
    const slug = typeof category === 'object' && category?.slug ? String(category.slug).toLowerCase().trim() : '';
    if (slug && DEFAULT_COLLECTION_ARTWORK[slug]) {
        return DEFAULT_COLLECTION_ARTWORK[slug];
    }
    return null;
}
