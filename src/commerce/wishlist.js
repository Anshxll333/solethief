import { validPairId } from './cart.js';

export const WISHLIST_KEY = 'solethief.wishlist.v1';
export const MAX_WISHLIST_ITEMS = 100;

export const emptyWishlist = () => ({ version: 1, ids: [] });

export function parseWishlist(raw) {
    if (raw === null || raw === undefined) return emptyWishlist();
    try {
        if (typeof raw !== 'string' || raw.length > 10000) return emptyWishlist();
        const value = JSON.parse(raw);
        if (!value || value.version !== 1 || !Array.isArray(value.ids)) return emptyWishlist();
        const validIds = value.ids.filter(validPairId);
        if (validIds.length > MAX_WISHLIST_ITEMS) return emptyWishlist();
        return { version: 1, ids: [...new Set(validIds)] };
    } catch {
        return emptyWishlist();
    }
}

export function hasWishlistItem(wishlist, id) {
    if (!validPairId(id)) return false;
    const current = Array.isArray(wishlist?.ids) ? wishlist.ids : [];
    return current.includes(id);
}

export function addWishlistItem(wishlist, id) {
    if (!validPairId(id)) return wishlist;
    const current = Array.isArray(wishlist?.ids) ? wishlist.ids : [];
    if (current.includes(id) || current.length >= MAX_WISHLIST_ITEMS) return wishlist;
    return { version: 1, ids: [...current, id] };
}

export function removeWishlistItem(wishlist, id) {
    if (!validPairId(id)) return wishlist;
    const current = Array.isArray(wishlist?.ids) ? wishlist.ids : [];
    if (!current.includes(id)) return wishlist;
    return { version: 1, ids: current.filter(item => item !== id) };
}

export function toggleWishlistItem(wishlist, id) {
    if (!validPairId(id)) return wishlist;
    const current = Array.isArray(wishlist?.ids) ? wishlist.ids : [];
    if (current.includes(id)) {
        return removeWishlistItem(wishlist, id);
    }
    return addWishlistItem(wishlist, id);
}

export function resolveWishlist(wishlist, catalog) {
    const ids = Array.isArray(wishlist?.ids) ? wishlist.ids : [];
    const products = Array.isArray(catalog?.products) ? catalog.products : [];
    return ids.map(id => ({
        id,
        product: products.find(p => p.id === id),
    }));
}
