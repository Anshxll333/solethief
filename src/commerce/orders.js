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
            const q = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
            if (!Number.isSafeInteger(p) || p < 0) {
                throw new Error('Invalid price minor paise amount in items.');
            }
            subtotalMinor += p * q;
        }
    } else if (input && typeof input === 'object') {
        if (Array.isArray(input.items)) {
            for (const item of input.items) {
                const p = item?.priceMinor ?? item?.unit_price_minor;
                const q = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
                if (!Number.isSafeInteger(p) || p < 0) {
                    throw new Error('Invalid price minor paise amount in items.');
                }
                subtotalMinor += p * q;
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
        const valid = parsed.filter(item => {
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

        // Preserve chronological placement queue: newest created_at first (top), oldest created_at last (bottom)
        // If created_at is equal or absent, maintain stable array order
        return [...valid].sort((a, b) => {
            const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0;
            if (timeA && timeB && timeA !== timeB) {
                return timeB - timeA;
            }
            return 0;
        });
    } catch {
        return [];
    }
}

export function getPreviewOrders(userId = null) {
    const storage = getStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(ORDERS_PREVIEW_KEY);
        const allOrders = parsePreviewOrders(raw);
        // If userId provided, filter orders to only show those belonging to this user
        if (userId) {
            return allOrders.filter(order => order.user_id === userId);
        }
        return allOrders;
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
        const existingIndex = existing.findIndex(o => o.id === order.id);
        let updated;
        if (existingIndex >= 0) {
            // Update in-place to preserve original placement/queue position
            updated = [...existing];
            updated[existingIndex] = order;
        } else {
            // Prepend new order; deduplicate by ID
            const filtered = existing.filter(o => o.id !== order.id);
            updated = [order, ...filtered].slice(0, MAX_ORDER_HISTORY);
        }
        storage.setItem(ORDERS_PREVIEW_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return [order];
    }
}

export function getPreviewOrderById(orderId, userId = null) {
    const orders = getPreviewOrders(userId);
    return orders.find(o => o.id === orderId) || null;
}

export const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export function canCancelOrder(order, now = Date.now()) {
    if (!order || !order.created_at) return false;
    const nonCancellable = ['cancelled', 'refunded', 'delivered', 'expired'];
    if (nonCancellable.includes(order.status)) return false;

    const createdAtMs = new Date(order.created_at).getTime();
    if (Number.isNaN(createdAtMs)) return false;

    const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
    if (Number.isNaN(nowMs)) return false;

    const elapsed = nowMs - createdAtMs;
    return elapsed >= 0 && elapsed <= CANCELLATION_WINDOW_MS;
}

export function getCancellationRemainingTime(order, now = Date.now()) {
    if (!order || !order.created_at) return null;
    const createdAtMs = new Date(order.created_at).getTime();
    if (Number.isNaN(createdAtMs)) return null;

    const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
    if (Number.isNaN(nowMs)) return null;

    const remainingMs = CANCELLATION_WINDOW_MS - (nowMs - createdAtMs);
    if (remainingMs <= 0) return null;

    const totalMinutes = Math.floor(remainingMs / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
        hours,
        minutes,
        remainingMs,
        formatted: hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`,
    };
}

export const REPLACEMENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

export function canReplaceOrder(order, now = Date.now()) {
    if (!order || order.status !== 'delivered') return false;
    if (order.replacement_requested || order.status === 'replaced') return false;

    const deliveredAtMs = new Date(order.delivered_at || order.updated_at || order.created_at).getTime();
    if (Number.isNaN(deliveredAtMs)) return false;

    const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
    if (Number.isNaN(nowMs)) return false;

    const elapsed = nowMs - deliveredAtMs;
    return elapsed >= 0 && elapsed <= REPLACEMENT_WINDOW_MS;
}

export function getReplacementRemainingTime(order, now = Date.now()) {
    if (!order || order.status !== 'delivered') return null;
    const deliveredAtMs = new Date(order.delivered_at || order.updated_at || order.created_at).getTime();
    if (Number.isNaN(deliveredAtMs)) return null;

    const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
    if (Number.isNaN(nowMs)) return null;

    const remainingMs = REPLACEMENT_WINDOW_MS - (nowMs - deliveredAtMs);
    if (remainingMs <= 0) return null;

    const totalHours = Math.floor(remainingMs / (60 * 60 * 1000));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    return {
        days,
        hours,
        remainingMs,
        formatted: days > 0 ? `${days}d ${hours}h remaining` : `${hours}h remaining`,
    };
}

export function updatePreviewOrderStatus(orderId, nextStatus, { reason = '', notes = '', trackingId = '' } = {}) {
    if (!orderId) {
        throw new Error('Order ID is required to update order status.');
    }
    const order = getPreviewOrderById(orderId);
    if (!order) {
        throw new Error(`Order ${orderId} not found in preview storage.`);
    }

    if (!isValidStatusTransition(order.status, nextStatus)) {
        throw new Error(`Invalid status transition from "${order.status}" to "${nextStatus}".`);
    }

    const isCancelled = nextStatus === 'cancelled';
    const isDelivered = nextStatus === 'delivered';
    const effectiveReason = reason || notes || order.cancel_reason || 'Cancelled';

    const updatedOrder = {
        ...order,
        status: nextStatus,
        cancel_reason: isCancelled ? effectiveReason : order.cancel_reason,
        rejection_reason: isCancelled ? (reason || order.rejection_reason || '') : order.rejection_reason,
        cancelled_by: isCancelled ? (order.cancelled_by || (reason.toLowerCase().includes('collector') || reason.toLowerCase().includes('mind') ? 'user' : 'admin')) : order.cancelled_by,
        cancelled_at: isCancelled ? (order.cancelled_at || new Date().toISOString()) : order.cancelled_at,
        delivered_at: isDelivered ? (order.delivered_at || new Date().toISOString()) : order.delivered_at,
        tracking_id: trackingId || order.tracking_id || null,
        fulfillment_notes: notes || order.fulfillment_notes || '',
        updated_at: new Date().toISOString(),
    };

    savePreviewOrder(updatedOrder);
    return updatedOrder;
}

export function requestPreviewOrderReplacement(orderId, { reason = '', preferredSize = '', notes = '' } = {}) {
    if (!orderId) throw new Error('Order ID is required to request replacement.');
    const order = getPreviewOrderById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found in preview storage.`);

    if (order.status !== 'delivered') {
        throw new Error('Only delivered orders are eligible for replacement.');
    }

    if (!canReplaceOrder(order)) {
        throw new Error('Replacement window of 3 days from delivery has expired.');
    }

    const updatedOrder = {
        ...order,
        replacement_requested: true,
        replacement_status: 'requested',
        replacement_reason: reason || 'Replacement requested by customer',
        replacement_preferred_size: preferredSize || 'Same size',
        replacement_notes: notes || '',
        replacement_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_history: [
            ...(order.order_history || []),
            {
                status: 'replacement_requested',
                reason,
                preferred_size: preferredSize,
                created_at: new Date().toISOString(),
            },
        ],
    };

    savePreviewOrder(updatedOrder);
    return updatedOrder;
}

