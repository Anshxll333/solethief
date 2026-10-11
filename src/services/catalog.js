import { shoesData } from '../data/shoes.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { getPreviewDrops } from '../commerce/admin.js';

const columns = 'id,name,brand,price_minor,currency,size,front_image,side_image';
const priceFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function adaptCatalogRow(row) {
    if (!row || !Number.isInteger(row.id) || row.id <= 0 || row.id > 2147483647 || !Number.isInteger(row.price_minor) || row.price_minor < 0 || row.price_minor > 2147483647 || row.currency !== 'INR') {
        throw new Error('Invalid catalog identity, price or currency.');
    }
    if (['name', 'brand', 'size', 'front_image', 'side_image'].some(key => typeof row[key] !== 'string' || !row[key].trim())) {
        throw new Error('Invalid catalog presentation fields.');
    }
    for (const image of [row.front_image, row.side_image]) {
        if (!/^\/(?!\/)/.test(image) && !/^https:\/\//i.test(image)) throw new Error('Invalid catalog image URL.');
    }
    return {
        id: row.id, name: row.name, brand: row.brand,
        price: priceFormat.format(row.price_minor / 100), priceMinor: row.price_minor,
        currency: row.currency, size: row.size,
        frontImage: row.front_image, sideImage: row.side_image,
        // Physics is presentation metadata, not part of pricing or inventory authority.
        physics: shoesData.some(shoe => shoe.id === row.id) ? { ...shoesData.find(shoe => shoe.id === row.id).physics } : undefined,
    };
}

export function previewDropToRow(drop) {
    return {
        id: drop.id, name: drop.name, brand: drop.brand, size: drop.size,
        price_minor: drop.priceMinor, currency: drop.currency,
        front_image: drop.frontImage, side_image: drop.sideImage, active: drop.active,
    };
}

export function createCatalogService(runtimeProvider = getSupabaseRuntime) {
    return {
        async list({ allowPreview = false } = {}) {
            const runtime = runtimeProvider();
            if (runtime.status === 'invalid') throw new Error(runtime.message || 'Invalid catalog configuration.');
            if (!runtime.client) {
                if (runtime.status !== 'missing' || !allowPreview) throw new Error(runtime.message);
                return {
                    source: 'preview', checkoutEnabled: false,
                    products: getPreviewDrops().filter(drop => drop.active).map(previewDropToRow).map(adaptCatalogRow),
                };
            }
            const { data, error } = await runtime.client.from('products').select(columns).eq('active', true).order('id');
            if (error) throw new Error('Live catalog request failed.', { cause: error });
            if (!Array.isArray(data)) throw new Error('Invalid live catalog response.');
            const products = data.map(adaptCatalogRow);
            if (new Set(products.map(product => product.id)).size !== products.length) throw new Error('Invalid live catalog: duplicate pair IDs.');
            return { source: 'supabase', checkoutEnabled: false, products };
        },
    };
}

export const catalogService = createCatalogService();
