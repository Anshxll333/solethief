export const CART_KEY = 'solethief.cart.v1';
export const MAX_PAIRS = 100;
export const validPairId = id => Number.isInteger(id) && id > 0 && id <= 2147483647;
export const emptyCart = () => ({ version: 1, source: null, ids: [] });

export function parseCart(raw) {
    if (raw === null) return emptyCart();
    try {
        if (typeof raw !== 'string' || raw.length > 10000) return emptyCart();
        const value = JSON.parse(raw);
        if (!value || value.version !== 1 || !['preview', 'supabase'].includes(value.source)
            || !Array.isArray(value.ids) || value.ids.length > MAX_PAIRS || !value.ids.every(validPairId)) return emptyCart();
        return { version: 1, source: value.source, ids: [...new Set(value.ids)] };
    } catch { return emptyCart(); }
}

export function canAddPair(product, source) {
    // Public products do not expose private inventory. Never infer live stock.
    return source === 'preview' && validPairId(product?.id)
        && Number.isInteger(product.priceMinor) && product.priceMinor >= 0
        && product.priceMinor <= 2147483647 && product.currency === 'INR';
}

export function addPair(cart, product, source) {
    if (!canAddPair(product, source)) return cart;
    const ids = cart.source === source ? cart.ids : [];
    if (ids.includes(product.id) || ids.length >= MAX_PAIRS) return cart;
    return { version: 1, source, ids: [...ids, product.id] };
}

export function resolveCart(cart, catalog) {
    if (Array.isArray(cart?.items) && cart.items.length > 0) {
        return cart.items.map(item => {
            const baseProduct = cart.source === catalog.source
                ? catalog.products.find(p => p.id === item.id)
                : null;
            const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
            const size = item.size || baseProduct?.size;
            const product = baseProduct ? { ...baseProduct, size: size || baseProduct.size } : baseProduct;
            const lineId = item.lineId || (size ? `${item.id}:${size}` : String(item.id));
            return {
                lineId,
                id: item.id,
                size: size || product?.size,
                product,
                eligible: canAddPair(baseProduct, catalog.source),
                quantity,
            };
        });
    }

    return (cart?.ids || []).map(id => {
        const product = cart.source === catalog.source ? catalog.products.find(item => item.id === id) : null;
        const quantity = (cart.quantities && Number.isInteger(cart.quantities[id]) && cart.quantities[id] > 0)
            ? cart.quantities[id]
            : (cart.quantities && Number.isInteger(cart.quantities[String(id)]) && cart.quantities[String(id)] > 0)
                ? cart.quantities[String(id)]
                : 1;
        return {
            lineId: String(id),
            id,
            size: product?.size || null,
            product,
            eligible: canAddPair(product, catalog.source),
            quantity,
        };
    });
}

export function subtotalMinor(lines) {
    return lines.reduce((sum, line) => {
        if (!line.product) return sum;
        const price = line.product.priceMinor;
        const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 1;
        if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(sum + price * qty)) throw new Error('Invalid cart price.');
        return sum + price * qty;
    }, 0);
}

export const formatMoney = minor => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
