import { shoesData } from '../data/shoes.js';
import { parsePrice } from './catalog.js';
import { validPairId } from './cart.js';
import { ALLOWED_ORDER_STATUSES } from './orders.js';
import { notifyShopUpdated } from './shopCategories.js';

export const ADMIN_STORAGE_DROPS_KEY = 'solethief.admin.drops.v1';
export const ADMIN_STORAGE_INVENTORY_KEY = 'solethief.admin.inventory.v1';
export const ADMIN_STORAGE_OPERATOR_KEY = 'solethief.admin.operator.v1';

export const INVENTORY_STATES = ['available', 'reserved', 'sold', 'archived', 'unavailable'];
export const VERIFICATION_STATUSES = ['unverified', 'authenticating', 'verified', 'rejected'];

export const ADMIN_ORDER_STATUSES = [
    'pending_payment',
    'paid',
    'confirmed',
    'authenticating',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refunded',
];

export const ADMIN_FULFILLMENT_TRANSITIONS = {
    pending_payment: ['confirmed', 'paid', 'cancelled'],
    paid: ['confirmed', 'authenticating', 'processing', 'cancelled'],
    confirmed: ['authenticating', 'shipped', 'cancelled'],
    authenticating: ['shipped', 'cancelled'],
    processing: ['authenticating', 'shipped', 'cancelled'],
    shipped: ['delivered', 'cancelled'],
    delivered: ['refunded'],
    cancelled: [],
    expired: [],
    refunded: [],
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
            frontImage: shoe.frontImage,
            sideImage: shoe.sideImage,
            active: true,
            dropBatch: `SHIBUYA-DROP-0${shoe.id}`,
            releaseDate: '2026-10-10',
            description: `${shoe.brand} ${shoe.name}. Limited archive pair in ${shoe.size}. Authenticated Tokyo street division.`,
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
        ids.add(drop.id);
    }
    return drops;
}

export function getPreviewDrops() {
    const storage = getProductStorage();
    if (!storage) {
        if (typeof window !== 'undefined') throw new Error('Preview product storage is unavailable.');
        return getDefaultSeedDrops();
    }
    const raw = storage.getItem(ADMIN_STORAGE_DROPS_KEY);
    if (raw === null) {
        const defaults = getDefaultSeedDrops();
        storage.setItem(ADMIN_STORAGE_DROPS_KEY, JSON.stringify(defaults));
        return defaults;
    }
    return validateStoredDrops(JSON.parse(raw));
}

export function savePreviewDrops(drops) {
    validateStoredDrops(drops);
    const storage = getProductStorage();
    if (!storage) throw new Error('Preview product storage is unavailable.');
    storage.setItem(ADMIN_STORAGE_DROPS_KEY, JSON.stringify(drops));
    notifyShopUpdated();
    return drops;
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
    if (priceMinor === undefined && drop.price !== undefined) {
        priceMinor = parsePrice(String(drop.price).replace(/,/g, ''));
    }

    if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0 || priceMinor > 2147483647) {
        errors.price = 'Valid price in INR (paise minor <= 2,147,483,647) is required.';
    }

    const frontImage = typeof drop.frontImage === 'string' ? drop.frontImage.trim() : '';
    if (!frontImage || (!frontImage.startsWith('/') && !frontImage.startsWith('http') && !frontImage.startsWith('data:'))) {
        errors.frontImage = 'Front image path or URL is required.';
    }

    const sideImage = typeof drop.sideImage === 'string' ? drop.sideImage.trim() : '';
    if (!sideImage || (!sideImage.startsWith('/') && !sideImage.startsWith('http') && !sideImage.startsWith('data:'))) {
        errors.sideImage = 'Side image path or URL is required.';
    }

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
            frontImage,
            sideImage,
            active: drop.active !== false,
            dropBatch: drop.dropBatch?.trim() || `DROP-${Date.now().toString().slice(-4)}`,
            releaseDate: drop.releaseDate || new Date().toISOString().slice(0, 10),
            description: drop.description?.trim() || '',
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
