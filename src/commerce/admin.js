import { shoesData } from '../data/shoes.js';
import { parsePrice } from './catalog.js';
import { validPairId } from './cart.js';
import { ALLOWED_ORDER_STATUSES } from './orders.js';
import { notifyShopUpdated } from './shopCategories.js';
import { normalizeShoeAssetPath } from '../services/transparentArtwork.js';

export const ADMIN_STORAGE_DROPS_KEY = 'solethief.admin.drops.v1';
export const ADMIN_STORAGE_INVENTORY_KEY = 'solethief.admin.inventory.v1';
export const ADMIN_STORAGE_OPERATOR_KEY = 'solethief.admin.operator.v1';
export const ADMIN_IDB_DATABASE_NAME = 'solethief_admin_db';
export const ADMIN_IDB_STORE_NAME = 'preview_drops_store';
export const ADMIN_IDB_KEY = 'solethief.admin.drops.v1';

let memoryDropsCache = null;

export function openAdminIndexedDB() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(ADMIN_IDB_DATABASE_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(ADMIN_IDB_STORE_NAME)) {
                    db.createObjectStore(ADMIN_IDB_STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

export async function saveDropsToIndexedDB(drops) {
    try {
        const db = await openAdminIndexedDB();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(ADMIN_IDB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(ADMIN_IDB_STORE_NAME);
                store.put(drops, ADMIN_IDB_KEY);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
                tx.onabort = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    } catch {
        return false;
    }
}

export async function getDropsFromIndexedDB() {
    try {
        const db = await openAdminIndexedDB();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(ADMIN_IDB_STORE_NAME, 'readonly');
                const store = tx.objectStore(ADMIN_IDB_STORE_NAME);
                const req = store.get(ADMIN_IDB_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    } catch {
        return null;
    }
}

if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
    getDropsFromIndexedDB().then((idbDrops) => {
        if (Array.isArray(idbDrops) && idbDrops.length > 0) {
            memoryDropsCache = idbDrops;
        }
    }).catch(() => { });
}

export {
    compressImage,
    compressImageFile,
    isOnlineImageUrl,
    downloadAndOptimizeRemoteImage,
    fetchAndOptimizeRemoteImage,
} from '../services/remoteImage.js';

export const INVENTORY_STATES = ['available', 'reserved', 'sold', 'archived', 'unavailable'];
export const VERIFICATION_STATUSES = ['unverified', 'authenticating', 'verified', 'rejected'];

export const ADMIN_ORDER_STATUSES = [
    'pending_payment', 'paid', 'confirmed', 'authenticating', 'processing',
    'shipped', 'delivered', 'returned', 'replaced', 'cancelled', 'refunded',
];

export const ADMIN_ORDER_FILTERS = ['pending', 'packed', 'shipped', 'delivered', 'returned'];

export function normalizeAdminOrderFilter(status) {
    if (status === 'pending') return ['pending_payment', 'paid', 'confirmed', 'authenticating', 'processing'];
    if (status === 'packed') return ['confirmed', 'authenticating', 'processing'];
    if (status === 'returned') return ['returned', 'replaced', 'refunded'];
    return status === 'all' ? null : [status];
}

export const ADMIN_FULFILLMENT_TRANSITIONS = {
    pending_payment: ['confirmed', 'paid', 'cancelled', 'returned', 'replaced'], paid: ['confirmed', 'authenticating', 'processing', 'cancelled', 'returned', 'replaced'],
    confirmed: ['authenticating', 'shipped', 'cancelled', 'returned', 'replaced'], authenticating: ['shipped', 'cancelled', 'returned', 'replaced'],
    processing: ['authenticating', 'shipped', 'cancelled', 'returned', 'replaced'], shipped: ['delivered', 'cancelled', 'returned', 'replaced'],
    delivered: ['returned', 'replaced', 'refunded'], returned: ['replaced', 'refunded'], replaced: [],
    cancelled: [], expired: [], refunded: [],
};

export function isValidAdminStatusTransition(currentStatus, nextStatus) {
    if (!currentStatus || !nextStatus) return false;
    if (currentStatus === nextStatus) return true;
    const allowed = ADMIN_FULFILLMENT_TRANSITIONS[currentStatus];
    if (Array.isArray(allowed) && allowed.includes(nextStatus)) return true;
    // Fall back to standard order statuses if applicable
    return ALLOWED_ORDER_STATUSES.includes(nextStatus);
}

function getStorage() {
    try {
        if (typeof window !== 'undefined' && window?.localStorage) return window.localStorage;
    } catch {
        // ignore
    }
    try {
        if (typeof globalThis !== 'undefined' && globalThis?.localStorage) return globalThis.localStorage;
    } catch {
        // ignore
    }
    return null;
}

export function getDefaultSeedDrops() {
    return shoesData.map((shoe) => {
        const parsedPrice = parsePrice(shoe.price.replace(/,/g, ''));
        const priceMinor = Number.isSafeInteger(parsedPrice) ? parsedPrice : 1800000;
        return {
            id: shoe.id,
            name: shoe.name,
            brand: shoe.brand,
            size: shoe.size,
            price: shoe.price,
            priceMinor,
            currency: 'INR',
            frontImage: normalizeShoeAssetPath(shoe.frontImage),
            sideImage: normalizeShoeAssetPath(shoe.sideImage),
            active: true,
            dropBatch: `SHIBUYA-DROP-0${shoe.id}`,
            releaseDate: '2026-10-10',
        };
    });
}

export function getDefaultSeedInventory() {
    return {
        1: {
            productId: 1,
            state: 'available',
            verified: true,
            verificationStatus: 'verified',
            verifiedBy: 'Kenji M. (Tokyo Authenticator #07)',
            verifiedAt: '2026-10-09T08:00:00Z',
            serialTag: 'ST-AUTH-001-TYO',
            boxCondition: 'Pristine with Japanese import tags',
        },
        2: {
            productId: 2,
            state: 'available',
            verified: true,
            verificationStatus: 'verified',
            verifiedBy: 'Kenji M. (Tokyo Authenticator #07)',
            verifiedAt: '2026-10-09T09:30:00Z',
            serialTag: 'ST-AUTH-002-TYO',
            boxCondition: 'Original box, deadstock laced',
        },
        3: {
            productId: 3,
            state: 'reserved',
            verified: true,
            verificationStatus: 'verified',
            verifiedBy: 'Sora T. (Harajuku Vault Lead)',
            verifiedAt: '2026-10-08T14:15:00Z',
            serialTag: 'ST-AUTH-003-TYO',
            boxCondition: 'Collector grade archive box',
        },
        4: {
            productId: 4,
            state: 'available',
            verified: true,
            verificationStatus: 'verified',
            verifiedBy: 'Sora T. (Harajuku Vault Lead)',
            verifiedAt: '2026-10-08T15:00:00Z',
            serialTag: 'ST-AUTH-004-TYO',
            boxCondition: 'Double-boxed, sealed verification loop',
        },
    };
}

function getProductStorage() {
    // No browser (e.g. SSR) may read defaults; browser storage failures must surface.
    return typeof window !== 'undefined' ? window.localStorage : globalThis.localStorage;
}

function validateStoredDrops(drops) {
    if (!Array.isArray(drops)) throw new Error('Drops must be an array');
    const ids = new Set();
    for (const drop of drops) {
        if (!drop || !Number.isInteger(drop.id) || drop.id <= 0 || drop.id > 2147483647 || ids.has(drop.id)
            || !Number.isInteger(drop.priceMinor) || drop.priceMinor < 0 || drop.priceMinor > 2147483647
            || drop.currency !== 'INR' || typeof drop.active !== 'boolean'
            || ['name', 'brand', 'size', 'frontImage', 'sideImage'].some(key => typeof drop[key] !== 'string' || !drop[key].trim())) {
            throw new Error('Invalid preview product store.');
        }
        if (drop.images !== undefined && (!Array.isArray(drop.images) || drop.images.some((image) => typeof image !== 'string'))) throw new Error('Invalid preview product images.');
        if (drop.sizes !== undefined && (!Array.isArray(drop.sizes) || drop.sizes.some((size) => !size.value))) throw new Error('Invalid preview product sizes.');
        ids.add(drop.id);
    }
    return drops;
}

export function getPreviewDrops() {
    const storage = getProductStorage();
    if (!storage) {
        if (typeof window !== 'undefined') throw new Error('Preview product storage is unavailable.');
        if (Array.isArray(memoryDropsCache)) return memoryDropsCache;
        return getDefaultSeedDrops();
    }
    const raw = storage.getItem(ADMIN_STORAGE_DROPS_KEY);
    if (raw === null) {
        memoryDropsCache = null;
        const defaults = getDefaultSeedDrops();
        storage.setItem(ADMIN_STORAGE_DROPS_KEY, JSON.stringify(defaults));
        return defaults;
    }
    // Preserve legacy stored objects; storefront adapters add rendering fallbacks.
    const drops = JSON.parse(raw);
    if (Array.isArray(memoryDropsCache) && Array.isArray(drops) && memoryDropsCache.length === drops.length) {
        for (let i = 0; i < drops.length; i++) {
            if (drops[i]?.id === memoryDropsCache[i]?.id) {
                if (memoryDropsCache[i]?.frontImage?.startsWith('data:') && (!drops[i]?.frontImage || !drops[i].frontImage.startsWith('data:'))) {
                    drops[i].frontImage = memoryDropsCache[i].frontImage;
                }
                if (memoryDropsCache[i]?.sideImage?.startsWith('data:') && (!drops[i]?.sideImage || !drops[i].sideImage.startsWith('data:'))) {
                    drops[i].sideImage = memoryDropsCache[i].sideImage;
                }
                if (Array.isArray(memoryDropsCache[i]?.images) && memoryDropsCache[i].images.length > (drops[i].images?.length || 0)) {
                    drops[i].images = memoryDropsCache[i].images;
                }
            }
        }
    }
    let healed = false;
    if (Array.isArray(drops)) {
        for (const drop of drops) {
            if (drop && typeof drop === 'object') {
                if (drop.status === 'active' && drop.active === false) {
                    drop.active = true;
                    healed = true;
                }
                if (!['active', 'sold_out', 'draft'].includes(drop.status)) {
                    drop.status = drop.active ? 'active' : 'draft';
                    healed = true;
                }
                const normFront = normalizeShoeAssetPath(drop.frontImage);
                if (normFront !== drop.frontImage) {
                    drop.frontImage = normFront;
                    healed = true;
                }
                const normSide = normalizeShoeAssetPath(drop.sideImage);
                if (normSide !== drop.sideImage) {
                    drop.sideImage = normSide;
                    healed = true;
                }
                if (Array.isArray(drop.images)) {
                    const nextImages = drop.images.map((img) => normalizeShoeAssetPath(img));
                    if (JSON.stringify(nextImages) !== JSON.stringify(drop.images)) {
                        drop.images = nextImages;
                        healed = true;
                    }
                }
            }
        }
        if (healed) {
            storage.setItem(ADMIN_STORAGE_DROPS_KEY, JSON.stringify(drops));
        }
    }
    return validateStoredDrops(drops);
}

export function savePreviewDrops(drops) {
    if (Array.isArray(drops)) {
        for (const drop of drops) {
            if (drop && typeof drop === 'object') {
                drop.frontImage = normalizeShoeAssetPath(drop.frontImage);
                drop.sideImage = normalizeShoeAssetPath(drop.sideImage);
                if (Array.isArray(drop.images)) {
                    drop.images = drop.images.map((img) => normalizeShoeAssetPath(img));
                }
                if (drop.active === false && (!drop.status || drop.status === 'active')) {
                    drop.status = 'draft';
                } else if (drop.status === 'draft') {
                    drop.active = false;
                } else if (!['active', 'sold_out', 'draft'].includes(drop.status)) {
                    drop.status = drop.active ? 'active' : 'draft';
                }
            }
        }
    }
    validateStoredDrops(drops);
    memoryDropsCache = drops;
    if (typeof indexedDB !== 'undefined') {
        saveDropsToIndexedDB(drops).catch(() => { });
    }
    const storage = getProductStorage();
    if (!storage) throw new Error('Preview product storage is unavailable.');
    const serializedDrops = JSON.stringify(drops);
    try {
        storage.setItem(ADMIN_STORAGE_DROPS_KEY, serializedDrops);
    } catch (err) {
        const isQuota = err?.name === 'QuotaExceededError'
            || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || err?.code === 22
            || err?.code === 1014
            || String(err?.message || '').toLowerCase().includes('quota');
        if (isQuota) {
            // Resilient fallback: Persist in IndexedDB if available
            if (typeof indexedDB !== 'undefined') {
                try {
                    saveDropsToIndexedDB(drops).catch(() => { });
                    const compactDrops = drops.map((d) => {
                        const copy = { ...d };
                        if (Array.isArray(copy.images) && copy.images.length > 2) {
                            copy.images = [copy.frontImage, copy.sideImage];
                        }
                        return copy;
                    });
                    try {
                        storage.setItem(ADMIN_STORAGE_DROPS_KEY, JSON.stringify(compactDrops));
                    } catch {
                        // Even if compact storage fails in localStorage, IndexedDB and memory hold data
                    }
                    notifyShopUpdated();
                    return drops;
                } catch {
                    // Fall through to quota error if indexedDB fails
                }
            }
            const hasBase64 = drops.some((d) =>
                (typeof d?.frontImage === 'string' && d.frontImage.startsWith('data:')) ||
                (typeof d?.sideImage === 'string' && d.sideImage.startsWith('data:')) ||
                (Array.isArray(d?.images) && d.images.some((img) => typeof img === 'string' && img.startsWith('data:')))
            );
            if (hasBase64) {
                throw new Error('Storage quota exceeded. Base64 images are too large for browser preview storage. Please use image URLs or smaller images.', { cause: err });
            }
            throw new Error('Storage quota exceeded. Browser storage is full. Please remove some preview drops or use image URLs.', { cause: err });
        }
        throw err;
    }
    notifyShopUpdated();
    return drops;
}

export function deletePreviewDrop(id) {
    const drops = getPreviewDrops();
    const next = drops.filter((drop) => drop.id !== Number(id));
    if (next.length === drops.length) throw new Error(`Drop with ID ${id} not found.`);
    savePreviewDrops(next);
    return next;
}

export function decrementPreviewStock(productId, size, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantity must be positive.');
    const drops = getPreviewDrops();
    const index = drops.findIndex((drop) => drop.id === Number(productId));
    if (index === -1) throw new Error(`Drop with ID ${productId} not found.`);
    const sizes = (drops[index].sizes || []).map((item) => ({ ...item }));
    const variant = sizes.find((item) => item.value === size);
    if (!variant || variant.sold || variant.quantity < quantity) throw new Error('Insufficient stock.');
    variant.quantity -= quantity;
    if (variant.quantity === 0) variant.sold = true;
    drops[index] = { ...drops[index], sizes };
    savePreviewDrops(drops);
    return variant.quantity;
}

export function getPreviewInventory() {
    const storage = getStorage();
    if (!storage) return getDefaultSeedInventory();
    try {
        const raw = storage.getItem(ADMIN_STORAGE_INVENTORY_KEY);
        if (!raw) {
            const defaults = getDefaultSeedInventory();
            storage.setItem(ADMIN_STORAGE_INVENTORY_KEY, JSON.stringify(defaults));
            return defaults;
        }
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : getDefaultSeedInventory();
    } catch {
        return getDefaultSeedInventory();
    }
}

export function savePreviewInventory(inventory) {
    if (!inventory || typeof inventory !== 'object') throw new Error('Inventory must be an object map');
    const storage = getStorage();
    if (storage) {
        try {
            storage.setItem(ADMIN_STORAGE_INVENTORY_KEY, JSON.stringify(inventory));
        } catch {
            // Storage quota or disabled
        }
    }
    return inventory;
}

export function validateDropInput(drop, isUpdate = false) {
    const errors = {};
    if (!drop || typeof drop !== 'object') {
        return { valid: false, errors: { form: 'Drop payload is required.' } };
    }

    if (!isUpdate || drop.id !== undefined) {
        if (!validPairId(drop.id)) {
            errors.id = 'Drop ID must be a positive integer.';
        }
    }

    const name = typeof drop.name === 'string' ? drop.name.trim() : '';
    if (!name || name.length > 120) {
        errors.name = 'Drop name must be between 1 and 120 characters.';
    }

    const brand = typeof drop.brand === 'string' ? drop.brand.trim() : '';
    if (!brand || brand.length > 100) {
        errors.brand = 'Brand must be between 1 and 100 characters.';
    }

    const size = typeof drop.size === 'string' ? drop.size.trim() : '';
    if (!size || size.length > 50) {
        errors.size = 'Sneaker size is required (e.g., US 9, UK 8.5).';
    }

    let priceMinor = drop.priceMinor;
    if (drop.price !== undefined && drop.price !== '') {
        const parsed = parsePrice(String(drop.price).replace(/,/g, ''));
        if (Number.isSafeInteger(parsed)) {
            priceMinor = parsed;
        }
    } else if (priceMinor === undefined && drop.price !== undefined) {
        priceMinor = parsePrice(String(drop.price).replace(/,/g, ''));
    }

    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0 || priceMinor > 2147483647) {
        errors.price = 'Valid price in INR (paise minor <= 2,147,483,647) is required.';
    }

    let comparePriceMinor = drop.comparePriceMinor;
    if (drop.comparePrice !== undefined) {
        const trimmed = String(drop.comparePrice).trim();
        comparePriceMinor = trimmed ? parsePrice(trimmed.replace(/,/g, '')) : null;
    } else if (comparePriceMinor === undefined && drop.originalPrice !== undefined) {
        const trimmed = String(drop.originalPrice).trim();
        comparePriceMinor = trimmed ? parsePrice(trimmed.replace(/,/g, '')) : null;
    }
    if (comparePriceMinor !== undefined && comparePriceMinor !== null && comparePriceMinor !== '' &&
        (!Number.isSafeInteger(comparePriceMinor) || comparePriceMinor < priceMinor || comparePriceMinor > 2147483647)) {
        errors.comparePrice = 'Compare price must be greater than or equal to the sale price.';
    }

    let status = drop.status;
    let active = drop.active !== false;
    if (status === 'draft') {
        active = false;
    } else if (status === 'active') {
        active = true;
    } else if (status === 'sold_out') {
        active = drop.active !== false;
    } else {
        status = active ? 'active' : 'draft';
    }
    const tags = Array.isArray(drop.tags)
        ? [...new Set(drop.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
        : [];
    const categoryId = drop.categoryId ? String(drop.categoryId) : '';

    const frontImage = typeof drop.frontImage === 'string' ? drop.frontImage.trim() : '';
    if (!frontImage || (!frontImage.startsWith('/') && !frontImage.startsWith('http') && !frontImage.startsWith('data:'))) {
        errors.frontImage = 'Front image path or URL is required.';
    }

    const sideImage = typeof drop.sideImage === 'string' ? drop.sideImage.trim() : '';
    if (!sideImage || (!sideImage.startsWith('/') && !sideImage.startsWith('http') && !sideImage.startsWith('data:'))) {
        errors.sideImage = 'Side image path or URL is required.';
    }

    const resolvedFrontImage = normalizeShoeAssetPath(frontImage);
    const resolvedSideImage = normalizeShoeAssetPath(sideImage);

    let parsedAdditional = [];
    if (typeof drop.additionalImages === 'string') {
        parsedAdditional = drop.additionalImages
            .split('\n')
            .map((url) => url.trim())
            .filter(Boolean);
    } else if (Array.isArray(drop.additionalImages)) {
        parsedAdditional = drop.additionalImages
            .map((url) => (typeof url === 'string' ? url.trim() : ''))
            .filter(Boolean);
    }

    let rawImagesList = [];
    if (Array.isArray(drop.images) && drop.images.length > 0) {
        rawImagesList = drop.images
            .map((image) => (typeof image === 'string' ? image.trim() : ''))
            .filter(Boolean);
    } else {
        rawImagesList = [resolvedFrontImage, resolvedSideImage, ...parsedAdditional].filter(Boolean);
    }

    if (rawImagesList.length === 0) {
        rawImagesList = [resolvedFrontImage, resolvedSideImage].filter(Boolean);
    }

    const images = rawImagesList.map((img) => normalizeShoeAssetPath(img));
    const invalidImage = images.find(
        (img) => !img.startsWith('/') && !img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:')
    );
    if (invalidImage) {
        errors.images = `Invalid image URL or path: "${invalidImage.slice(0, 50)}". Links must start with /, http://, https://, or data:`;
    }

    const sizes = Array.isArray(drop.sizes) && drop.sizes.length
        ? drop.sizes.map((item) => ({
            value: String(item.value || '').trim(),
            quantity: Math.max(0, Number(item.quantity) || 0),
            sold: Boolean(item.sold),
        })).filter((item) => item.value)
        : [{ value: size, quantity: 1, sold: false }];

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        normalized: {
            id: Number(drop.id),
            name,
            brand: brand.toUpperCase(),
            size,
            priceMinor,
            currency: 'INR',
            frontImage: resolvedFrontImage,
            sideImage: resolvedSideImage,
            images: images.length ? images : [resolvedFrontImage, resolvedSideImage],
            active,
            status,
            comparePriceMinor: comparePriceMinor === '' || comparePriceMinor === undefined ? null : comparePriceMinor,
            tags,
            categoryId,
            dropBatch: drop.dropBatch?.trim() || `DROP-${Date.now().toString().slice(-4)}`,
            releaseDate: drop.releaseDate || new Date().toISOString().slice(0, 10),
            description: drop.description?.trim() || '',
            upperMaterial: drop.upperMaterial?.trim() || '',
            soleMaterial: drop.soleMaterial?.trim() || '',
            careInstructions: drop.careInstructions?.trim() || '',
            sizes,
        },
    };
}

export function validateInventoryPairState(state) {
    return INVENTORY_STATES.includes(state);
}

export function calculateOperationalMetrics({ drops = [], inventory = {}, orders = [] }) {
    // Total Revenue (INR minor paise) from paid/confirmed/shipped/delivered orders
    const nonCancelledStatuses = ['paid', 'confirmed', 'authenticating', 'processing', 'shipped', 'delivered'];
    let totalRevenueMinor = 0;

    for (const order of orders) {
        if (nonCancelledStatuses.includes(order.status)) {
            const amount = order.total_minor ?? order.total_amount_minor ?? 0;
            if (Number.isSafeInteger(amount) && amount > 0) {
                totalRevenueMinor += amount;
            }
        }
    }

    // Active drops count
    const activeDropsCount = drops.filter((d) => d.active !== false).length;

    // Pairs available in inventory
    const inventoryValues = Object.values(inventory);
    const availablePairsCount = inventoryValues.filter((inv) => inv?.state === 'available').length;

    // Pending shipments (orders confirmed, authenticating, processing, or paid awaiting dispatch)
    const pendingShipmentStatuses = ['paid', 'confirmed', 'authenticating', 'processing'];
    const pendingShipmentsCount = orders.filter((o) => pendingShipmentStatuses.includes(o.status)).length;

    return {
        totalRevenueMinor,
        activeDropsCount,
        availablePairsCount,
        pendingShipmentsCount,
        totalOrdersCount: orders.length,
    };
}

export function getOperatorSession() {
    const storage = getStorage();
    if (!storage) {
        return { isOperator: true, operatorId: 'op_shibuya_preview_01', role: 'admin' };
    }
    try {
        const raw = storage.getItem(ADMIN_STORAGE_OPERATOR_KEY);
        if (!raw) {
            // Default operator mode active for preview store owner
            const defaultOp = { isOperator: true, operatorId: 'op_shibuya_preview_01', role: 'admin' };
            storage.setItem(ADMIN_STORAGE_OPERATOR_KEY, JSON.stringify(defaultOp));
            return defaultOp;
        }
        return JSON.parse(raw);
    } catch {
        return { isOperator: true, operatorId: 'op_shibuya_preview_01', role: 'admin' };
    }
}

export function setOperatorSession(session) {
    const storage = getStorage();
    if (storage) {
        try {
            if (!session) {
                storage.removeItem(ADMIN_STORAGE_OPERATOR_KEY);
            } else {
                storage.setItem(ADMIN_STORAGE_OPERATOR_KEY, JSON.stringify(session));
            }
        } catch {
            // Storage quota or disabled
        }
    }
    return session;
}
