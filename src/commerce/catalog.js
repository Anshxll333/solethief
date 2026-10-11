import { validPairId } from './cart.js';

export function parseProductId(value) {
    if (!/^[1-9]\d*$/.test(value ?? '')) return null;
    const id = Number(value);
    return validPairId(id) ? id : null;
}

export function parsePrice(value) {
    if (value === '') return null;
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
    const [whole, fraction = ''] = value.split('.');
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(minor) && minor <= 2147483647 ? minor : NaN;
}

export function filterCatalog(products, { query = '', brand = '', size = '', min = null, max = null, sort = 'featured' } = {}) {
    const needle = query.trim().toLowerCase();
    const result = products.filter(product => `${product.name} ${product.brand} ${product.size}`.toLowerCase().includes(needle)
        && (!brand || product.brand === brand) && (!size || product.size === size)
        && (min === null || product.priceMinor >= min) && (max === null || product.priceMinor <= max));
    const compare = {
        featured: (a, b) => a.id - b.id,
        'price-asc': (a, b) => a.priceMinor - b.priceMinor || a.id - b.id,
        'price-desc': (a, b) => b.priceMinor - a.priceMinor || a.id - b.id,
        name: (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
    };
    return result.sort(compare[sort] ?? compare.featured);
}
