import { shoesData } from '../data/shoes.js';
import { getSupabaseRuntime } from '../lib/supabase.js';
import { getPreviewDrops } from '../commerce/admin.js';
import { normalizeShoeAssetPath } from './transparentArtwork.js';

const columns = 'id,name,brand,price_minor,currency,size,front_image,side_image,description,images,sizes';
const priceFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function isCatalogImageUrl(value) {
    return /^\/(?!\/)/.test(value) || /^https:\/\//i.test(value) || DATA_IMAGE.test(value);
}

function normalizeDetails(row) {
    const detailKeys = ['description', 'upper_material', 'sole_material', 'care_instructions'];
    const hasDetails = Array.isArray(row.sizes) || Array.isArray(row.images) || detailKeys.some((key) => typeof row[key] === 'string');
    if (!hasDetails) return {};
    const sizes = Array.isArray(row.sizes) && row.sizes.length ? row.sizes : [{ value: row.size, quantity: 1, sold: false }];
    const images = Array.isArray(row.images) && row.images.length ? row.images : [row.front_image, row.side_image];
    return {
        sizes,
        images,
        description: typeof row.description === 'string' ? row.description : '',
        upperMaterial: typeof row.upper_material === 'string' ? row.upper_material : '',
        soleMaterial: typeof row.sole_material === 'string' ? row.sole_material : '',
        careInstructions: typeof row.care_instructions === 'string' ? row.care_instructions : '',
    };
}

export function adaptCatalogRow(row) {
    if (!row || !Number.isInteger(row.id) || row.id <= 0 || row.id > 2147483647 || !Number.isInteger(row.price_minor) || row.price_minor < 0 || row.price_minor > 2147483647 || row.currency !== 'INR') {
        throw new Error('Invalid catalog identity, price or currency.');
    }
    if (['name', 'brand', 'size', 'front_image', 'side_image'].some(key => typeof row[key] !== 'string' || !row[key].trim())) {
        throw new Error('Invalid catalog presentation fields.');
    }
    for (const image of [row.front_image, row.side_image]) {
        if (!isCatalogImageUrl(image)) throw new Error('Invalid catalog image URL.');
    }
    const frontImage = normalizeShoeAssetPath(row.front_image);
    const sideImage = normalizeShoeAssetPath(row.side_image);
    const details = normalizeDetails(row);
    if (Array.isArray(details.images)) {
        details.images = details.images.map((img) => normalizeShoeAssetPath(img));
    }
    return {
        id: row.id, name: row.name, brand: row.brand,
        price: priceFormat.format(row.price_minor / 100), priceMinor: row.price_minor,
        currency: row.currency, size: row.size,
        frontImage, sideImage,
        ...details,
        physics: shoesData.some(shoe => shoe.id === row.id) ? { ...shoesData.find(shoe => shoe.id === row.id).physics } : undefined,
    };
}

export function previewDropToRow(drop) {
    const front_image = normalizeShoeAssetPath(drop.frontImage);
    const side_image = normalizeShoeAssetPath(drop.sideImage);
    const row = {
        id: drop.id, name: drop.name, brand: drop.brand, size: drop.size,
        price_minor: drop.priceMinor, currency: drop.currency,
        front_image, side_image, active: drop.active,
    };
    // Keep legacy seed objects unchanged while forwarding metadata saved by the admin editor.
    if (typeof drop.description === 'string' && drop.description) row.description = drop.description;
    if (typeof drop.upperMaterial === 'string' && drop.upperMaterial) row.upper_material = drop.upperMaterial;
    if (typeof drop.soleMaterial === 'string' && drop.soleMaterial) row.sole_material = drop.soleMaterial;
    if (typeof drop.careInstructions === 'string' && drop.careInstructions) row.care_instructions = drop.careInstructions;
    if (Array.isArray(drop.images) && drop.images.length) row.images = drop.images.map(normalizeShoeAssetPath);
    if (Array.isArray(drop.sizes) && drop.sizes.length) row.sizes = drop.sizes;
    return row;
}

export function createCatalogService(runtimeProvider = getSupabaseRuntime) {
    return {
        async list({ allowPreview = false } = {}) {
            const runtime = runtimeProvider();
            if (runtime.status === 'invalid') throw new Error(runtime.message || 'Invalid catalog configuration.');
            if (!runtime.client) {
                if (runtime.status !== 'missing' || !allowPreview) throw new Error(runtime.message);
                const drops = getPreviewDrops();
                const filtered = drops.filter(drop => drop.active);
                return {
                    source: 'preview', checkoutEnabled: false,
                    products: filtered.map(previewDropToRow).map(adaptCatalogRow),
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
