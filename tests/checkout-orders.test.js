import test from 'node:test';
import assert from 'node:assert/strict';

// Setup mock window/localStorage for Node test runner before importing modules
const mockStore = new Map();
const storageMock = {
    getItem: (key) => mockStore.get(key) || null,
    setItem: (key, val) => mockStore.set(key, String(val)),
    removeItem: (key) => mockStore.delete(key),
    clear: () => mockStore.clear(),
};
globalThis.localStorage = storageMock;
if (typeof globalThis.window === 'undefined') {
    globalThis.window = { localStorage: storageMock };
} else {
    globalThis.window.localStorage = storageMock;
}

const {
    ORDERS_PREVIEW_KEY,
    MAX_ORDER_HISTORY,
    SHIPPING_OPTIONS,
    ALLOWED_ORDER_STATUSES,
    generateOrderId,
    isValidOrderId,
    calculateOrderTotals,
    isValidStatusTransition,
    parsePreviewOrders,
    savePreviewOrder,
    getPreviewOrderById,
} = await import('../src/commerce/orders.js');

const { validateAddress } = await import('../src/commerce/address.js');
const { createOrdersService } = await import('../src/services/orders.js');

test('orders preview storage key and constraints match contract', () => {
    assert.equal(ORDERS_PREVIEW_KEY, 'solethief.orders.v1');
    assert.equal(MAX_ORDER_HISTORY, 50);
    assert.ok(ALLOWED_ORDER_STATUSES.includes('pending_payment'));
    assert.ok(ALLOWED_ORDER_STATUSES.includes('paid'));
    assert.ok(ALLOWED_ORDER_STATUSES.includes('processing'));
    assert.ok(ALLOWED_ORDER_STATUSES.includes('shipped'));
    assert.ok(ALLOWED_ORDER_STATUSES.includes('delivered'));
    assert.ok(ALLOWED_ORDER_STATUSES.includes('cancelled'));
});

test('order ID generator produces valid format and validator validates correctly', () => {
    const id = generateOrderId();
    const currentYear = new Date().getFullYear();
    assert.match(id, new RegExp(`^ST-${currentYear}-[A-Z0-9]{4}$`));
    assert.equal(isValidOrderId(id), true);

    // Valid checks
    assert.equal(isValidOrderId('ST-2026-A1B2'), true);
    assert.equal(isValidOrderId('ST-2025-9999'), true);
    assert.equal(isValidOrderId('ST-2026-ABCDEF12'), true);

    // Invalid checks
    assert.equal(isValidOrderId(''), false);
    assert.equal(isValidOrderId(null), false);
    assert.equal(isValidOrderId('ST-26-ABCD'), false);
    assert.equal(isValidOrderId('ST-2026-abc1'), false); // lowercase disallowed
    assert.equal(isValidOrderId('SO-2026-ABCD'), false); // wrong prefix
    assert.equal(isValidOrderId('ST-2026-ABCDEFGHI'), false); // too long
});

test('calculateOrderTotals correctly computes subtotal, GST 18%, shipping, and integer paise total', () => {
    const items = [
        { priceMinor: 100000 }, // Rs 1,000.00
        { priceMinor: 200000 }, // Rs 2,000.00
    ];

    // Standard free shipping
    const standard = calculateOrderTotals(items, 'standard');
    assert.equal(standard.subtotalMinor, 300000);
    assert.equal(standard.shippingMinor, 0);
    assert.equal(standard.taxMinor, 54000); // 18% of 300,000 = 54,000 paise (Rs 540.00)
    assert.equal(standard.totalMinor, 354000); // 300,000 + 0 + 54,000 = 354,000 paise (Rs 3,540.00)
    assert.equal(standard.currency, 'INR');

    // Priority Express courier shipping (Rs 450.00 = 45000 paise)
    const priority = calculateOrderTotals(items, 'priority');
    assert.equal(priority.subtotalMinor, 300000);
    assert.equal(priority.shippingMinor, SHIPPING_OPTIONS.priority.priceMinor);
    assert.equal(priority.taxMinor, 54000);
    assert.equal(priority.totalMinor, 354000 + SHIPPING_OPTIONS.priority.priceMinor);

    // Options object format
    const fromOptions = calculateOrderTotals({
        subtotalMinor: 300000,
        shippingOptionId: 'priority',
    });
    assert.equal(fromOptions.totalMinor, priority.totalMinor);

    // Empty items
    const empty = calculateOrderTotals([], 'standard');
    assert.equal(empty.subtotalMinor, 0);
    assert.equal(empty.shippingMinor, 0);
    assert.equal(empty.taxMinor, 0);
    assert.equal(empty.totalMinor, 0);
});

test('calculateOrderTotals throws on malformed or extreme boundary values', () => {
    assert.throws(() => calculateOrderTotals(null), /Order items array or options object is required/);
    assert.throws(() => calculateOrderTotals([{ priceMinor: -100 }]), /Invalid price/);
    assert.throws(() => calculateOrderTotals([{ priceMinor: 'invalid' }]), /Invalid price/);
    assert.throws(() => calculateOrderTotals([{ priceMinor: 2147483648 }]), /Order total exceeds/);
});

test('order state machine transition validator enforces authorized business lifecycle', () => {
    // Valid transitions from pending_payment
    assert.equal(isValidStatusTransition('pending_payment', 'paid'), true);
    assert.equal(isValidStatusTransition('pending_payment', 'processing'), true);
    assert.equal(isValidStatusTransition('pending_payment', 'cancelled'), true);
    assert.equal(isValidStatusTransition('pending_payment', 'expired'), true);

    // Valid transitions down fulfillment pipeline
    assert.equal(isValidStatusTransition('paid', 'processing'), true);
    assert.equal(isValidStatusTransition('paid', 'cancelled'), true);
    assert.equal(isValidStatusTransition('paid', 'refunded'), true);
    assert.equal(isValidStatusTransition('processing', 'shipped'), true);
    assert.equal(isValidStatusTransition('shipped', 'delivered'), true);

    // Terminal or invalid reverse transitions
    assert.equal(isValidStatusTransition('delivered', 'pending_payment'), false);
    assert.equal(isValidStatusTransition('delivered', 'shipped'), false);
    assert.equal(isValidStatusTransition('cancelled', 'paid'), false);
    assert.equal(isValidStatusTransition('expired', 'paid'), false);
    assert.equal(isValidStatusTransition('unknown_state', 'paid'), false);
});

test('preview order parsing and storage safely handles corrupt data and maintains FIFO limit', () => {
    mockStore.clear();

    // Corrupt inputs
    assert.deepEqual(parsePreviewOrders(null), []);
    assert.deepEqual(parsePreviewOrders(''), []);
    assert.deepEqual(parsePreviewOrders('not-json'), []);
    assert.deepEqual(parsePreviewOrders('{}'), []);
    assert.deepEqual(parsePreviewOrders('{"version":2}'), []);

    // Valid empty state
    assert.deepEqual(parsePreviewOrders('[]'), []);

    // Save orders
    const order1 = { id: 'ST-2026-0001', total_amount_minor: 100000, status: 'paid', items: [] };
    const order2 = { id: 'ST-2026-0002', total_amount_minor: 250000, status: 'processing', items: [] };

    savePreviewOrder(order1);
    savePreviewOrder(order2);

    const saved = parsePreviewOrders(mockStore.get(ORDERS_PREVIEW_KEY));
    assert.equal(saved.length, 2);
    assert.equal(saved[0].id, 'ST-2026-0002'); // newest first
    assert.equal(saved[1].id, 'ST-2026-0001');

    assert.deepEqual(getPreviewOrderById('ST-2026-0002'), order2);
    assert.deepEqual(getPreviewOrderById('ST-2026-0001'), order1);
    assert.equal(getPreviewOrderById('ST-2026-NONEXISTENT'), null);
});

test('checkout shipping address validation adheres to Indian courier standards', () => {
    const valid = {
        recipient: 'Aarav Sharma',
        phone: '9876543210',
        line1: '12 Marine Drive, Nariman Point',
        line2: 'Apt 4B',
        city: 'Mumbai',
        region: 'Maharashtra',
        postal_code: '400021',
    };

    const res = validateAddress(valid);
    assert.equal(res.valid, true);
    assert.equal(Object.keys(res.errors).length, 0);
    assert.equal(res.normalized.phone, '9876543210');
    assert.equal(res.normalized.postal_code, '400021');

    // Invalid phone (empty or too long)
    const invalidPhone = validateAddress({ ...valid, phone: '' });
    assert.equal(invalidPhone.valid, false);
    assert.ok(invalidPhone.errors.phone);

    // Invalid PIN code (must be exactly 6 digits)
    const invalidPin5 = validateAddress({ ...valid, postal_code: '12345' });
    assert.equal(invalidPin5.valid, false);
    assert.ok(invalidPin5.errors.postal_code);

    const invalidPinAlpha = validateAddress({ ...valid, postal_code: 'ABCDEF' });
    assert.equal(invalidPinAlpha.valid, false);
    assert.ok(invalidPinAlpha.errors.postal_code);

    // Missing line1
    const missingLine = validateAddress({ ...valid, line1: '' });
    assert.equal(missingLine.valid, false);
    assert.ok(missingLine.errors.line1);
});

test('createOrdersService handles preview order flow, ID generation, and retrieval', async () => {
    mockStore.clear();

    const ordersService = createOrdersService(() => ({ previewMode: true }));

    const orderPayload = {
        items: [
            {
                id: 1,
                name: 'Kobe 6 Protro "Grinch"',
                brand: 'Nike',
                size: 'UK 10',
                priceMinor: 4800000,
                frontImage: '/shoes/shoe-1-front.png',
            },
        ],
        shippingAddress: {
            recipient: 'Rohan Mehra',
            phone: '9820012345',
            line1: 'Bandra West, Hill Road',
            city: 'Mumbai',
            region: 'Maharashtra',
            postal_code: '400050',
        },
        shippingOptionId: 'priority',
        paymentMethod: 'razorpay',
    };

    const { data: order, error } = await ordersService.createOrder(orderPayload);
    assert.equal(error, null);
    assert.ok(order);
    assert.ok(isValidOrderId(order.id));
    assert.equal(order.status, 'paid');
    assert.equal(order.shipping_name, 'Rohan Mehra');
    assert.equal(order.shipping_method, 'priority');
    assert.equal(order.payment_method, 'razorpay');
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].brand, 'Nike');

    // Retrieve order by ID
    const { data: fetchedOrder, error: fetchErr } = await ordersService.getOrder(order.id);
    assert.equal(fetchErr, null);
    assert.equal(fetchedOrder.id, order.id);

    // List orders
    const { data: orderList, error: listErr } = await ordersService.listOrders();
    assert.equal(listErr, null);
    assert.equal(orderList.length, 1);
    assert.equal(orderList[0].id, order.id);
});
