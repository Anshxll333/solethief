export const ORDERS_PREVIEW_KEY = 'solethief.orders.v1';
export const MAX_ORDER_HISTORY = 50;

export const SHIPPING_OPTIONS = {
    standard: {
        id: 'standard',
        name: 'Standard Insured Delivery',
        priceMinor: 0,
        timeline: '3–5 business days',
        description: 'Complimentary insured courier delivery across India.',
    },
    priority: {
        id: 'priority',
        name: 'Priority Courier Express',
        priceMinor: 45000, // ₹450.00
        timeline: '24–48 hours dispatch',
        description: 'Priority handling & express air transit with tracking.',
    },
};

export const ALLOWED_ORDER_STATUSES = [
    'pending_payment',
    'paid',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'expired',
    'refunded',
];

export const VALID_STATUS_TRANSITIONS = {
    pending_payment: ['paid', 'processing', 'cancelled', 'expired'],
    paid: ['processing', 'cancelled', 'refunded'],
    processing: ['shipped', 'cancelled', 'refunded'],
    shipped: ['delivered', 'cancelled', 'refunded'],
    delivered: ['refunded'],
    cancelled: [],
    expired: [],
    refunded: [],
};

export function isValidStatusTransition(currentStatus, nextStatus) {
    if (!currentStatus || !nextStatus) return false;
    if (currentStatus === nextStatus) return true;
    const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
    return Array.isArray(allowed) && allowed.includes(nextStatus);
}

export function generateOrderId() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 4; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ST-2026-${suffix}`;
}

export function isValidOrderId(orderId) {
    if (typeof orderId !== 'string') return false;
    return /^ST-\d{4}-[A-Z0-9]{4,8}$/.test(orderId) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
}

export function calculateOrderTotals(input = {}, maybeShipping = 'standard') {
    let subtotalMinor = 0;
    let shippingOptionId = 'standard';
    let taxRate = 0.18; // 18% GST standard in India
    let discountMinor = 0;

    if (Array.isArray(input)) {
        if (typeof maybeShipping === 'string') {
            shippingOptionId = maybeShipping;
        }
        for (const item of input) {
            const p = item?.priceMinor ?? item?.unit_price_minor;
            if (!Number.isSafeInteger(p) || p < 0) {
                throw new Error('Invalid price minor paise amount in items.');
            }
            subtotalMinor += p;
        }
    } else if (input && typeof input === 'object') {
        if (Array.isArray(input.items)) {
            for (const item of input.items) {
                const p = item?.priceMinor ?? item?.unit_price_minor;
                if (!Number.isSafeInteger(p) || p < 0) {
                    throw new Error('Invalid price minor paise amount in items.');
                }
                subtotalMinor += p;
            }
        } else {
            subtotalMinor = input.subtotalMinor ?? 0;
        }
        shippingOptionId = input.shippingOptionId || maybeShipping;
        taxRate = input.taxRate ?? 0.18;
        discountMinor = input.discountMinor ?? 0;
    } else {
        throw new Error('Order items array or options object is required.');
    }

    if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) {
        throw new Error('Invalid subtotal minor paise amount.');
    }
    const shipping = SHIPPING_OPTIONS[shippingOptionId] || SHIPPING_OPTIONS.standard;
    const shippingMinor = shipping.priceMinor;

    const taxableAmount = subtotalMinor;
    const taxMinor = Math.round(taxableAmount * taxRate);

    if (!Number.isSafeInteger(discountMinor) || discountMinor < 0 || discountMinor > subtotalMinor) {
        throw new Error('Invalid discount minor paise amount.');
    }

    const totalMinor = subtotalMinor + shippingMinor + taxMinor - discountMinor;

    // PostgreSQL integer range check
    if (totalMinor > 2147483647) {
        throw new Error('Order total exceeds maximum allowable currency minor integer.');
    }

    return {
        currency: 'INR',
        subtotalMinor,
        shippingMinor,
        taxMinor,
        discountMinor,
        totalMinor,
        shippingOption: shipping,
    };
}

function getStorage() {
    try {
        if (typeof window !== 'undefined' && window && window.localStorage) {
            return window.localStorage;
        }
    } catch {
        // ignore
    }
    try {
        if (typeof globalThis !== 'undefined' && globalThis && globalThis.localStorage) {
            return globalThis.localStorage;
        }
    } catch {
        // ignore
    }
    return null;
}

export function parsePreviewOrders(raw) {
    if (!raw) return [];
    try {
        if (typeof raw !== 'string' || raw.length > 50000) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item => {
            const total = item?.total_amount_minor ?? item?.total_minor;
            return (
                item &&
                typeof item === 'object' &&
                isValidOrderId(item.id) &&
                ALLOWED_ORDER_STATUSES.includes(item.status) &&
                Number.isSafeInteger(total) &&
                total >= 0 &&
                (!item.items || Array.isArray(item.items))
            );
        }).slice(0, MAX_ORDER_HISTORY);
    } catch {
        return [];
    }
}

export function getPreviewOrders() {
    const storage = getStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(ORDERS_PREVIEW_KEY);
        return parsePreviewOrders(raw);
    } catch {
        return [];
    }
}

export function savePreviewOrder(order) {
    if (!order || !isValidOrderId(order.id)) {
        throw new Error('Invalid order structure for preview storage.');
    }
    const storage = getStorage();
    if (!storage) return [order];
    try {
        const existing = getPreviewOrders();
        // Prepend new order; deduplicate by ID
        const filtered = existing.filter(o => o.id !== order.id);
        const updated = [order, ...filtered].slice(0, MAX_ORDER_HISTORY);
        storage.setItem(ORDERS_PREVIEW_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return [order];
    }
}

export function getPreviewOrderById(orderId) {
    const orders = getPreviewOrders();
    return orders.find(o => o.id === orderId) || null;
}
