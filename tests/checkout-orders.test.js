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
    canCancelOrder,
    getCancellationRemainingTime,
    CANCELLATION_WINDOW_MS,
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

    // Updating existing order (e.g., cancelling order1) must preserve its original position at the bottom
    const cancelledOrder1 = { ...order1, status: 'cancelled' };
    savePreviewOrder(cancelledOrder1);
    const updatedSaved = parsePreviewOrders(mockStore.get(ORDERS_PREVIEW_KEY));
    assert.equal(updatedSaved.length, 2);
    assert.equal(updatedSaved[0].id, 'ST-2026-0002'); // order2 stays at top
    assert.equal(updatedSaved[1].id, 'ST-2026-0001'); // order1 stays in original position (bottom)
    assert.equal(updatedSaved[1].status, 'cancelled');
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

test('24-hour order cancellation helpers strictly enforce the 24-hour window', () => {
    const now = 1776000000000; // Reference timestamp
    assert.equal(CANCELLATION_WINDOW_MS, 24 * 60 * 60 * 1000);

    // Eligible orders within 24 hours
    const freshOrder = {
        id: 'ST-2026-0001',
        status: 'placed',
        created_at: new Date(now - 1000).toISOString(),
    };
    assert.equal(canCancelOrder(freshOrder, now), true);

    const midWindowOrder = {
        id: 'ST-2026-0002',
        status: 'processing',
        created_at: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal(canCancelOrder(midWindowOrder, now), true);
    const remMid = getCancellationRemainingTime(midWindowOrder, now);
    assert.ok(remMid);
    assert.equal(remMid.hours, 12);
    assert.equal(remMid.minutes, 0);
    assert.equal(remMid.formatted, '12h 0m remaining');

    const boundaryOrder = {
        id: 'ST-2026-0003',
        status: 'paid',
        created_at: new Date(now - (24 * 60 * 60 * 1000 - 60000)).toISOString(), // 23h 59m ago
    };
    assert.equal(canCancelOrder(boundaryOrder, now), true);
    const remBoundary = getCancellationRemainingTime(boundaryOrder, now);
    assert.equal(remBoundary.hours, 0);
    assert.equal(remBoundary.minutes, 1);
    assert.equal(remBoundary.formatted, '1m remaining');

    // Ineligible: Exceeded 24 hours
    const expiredOrder = {
        id: 'ST-2026-0004',
        status: 'processing',
        created_at: new Date(now - (24 * 60 * 60 * 1000 + 1000)).toISOString(), // 24 hours and 1 second ago
    };
    assert.equal(canCancelOrder(expiredOrder, now), false);
    assert.equal(getCancellationRemainingTime(expiredOrder, now), null);

    const oldOrder = {
        id: 'ST-2026-0005',
        status: 'paid',
        created_at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
    };
    assert.equal(canCancelOrder(oldOrder, now), false);
    assert.equal(getCancellationRemainingTime(oldOrder, now), null);

    // Ineligible: Terminal or already delivered/cancelled statuses
    assert.equal(canCancelOrder({ ...freshOrder, status: 'cancelled' }, now), false);
    assert.equal(canCancelOrder({ ...freshOrder, status: 'refunded' }, now), false);
    assert.equal(canCancelOrder({ ...freshOrder, status: 'delivered' }, now), false);
    assert.equal(canCancelOrder({ ...freshOrder, status: 'expired' }, now), false);

    // Invalid or missing timestamps
    assert.equal(canCancelOrder(null), false);
    assert.equal(canCancelOrder({}), false);
    assert.equal(canCancelOrder({ status: 'paid', created_at: null }), false);
    assert.equal(canCancelOrder({ status: 'paid', created_at: 'invalid-date' }), false);
});

test('createOrdersService.cancelOrder successfully cancels orders within 24 hours and rejects invalid ones', async () => {
    mockStore.clear();
    const ordersService = createOrdersService(() => ({ previewMode: true }));

    // 1. Create a fresh order
    const { data: freshOrder } = await ordersService.createOrder({
        items: [{ id: 1, name: 'Air Jordan 1 High', brand: 'Nike', size: 'UK 9', priceMinor: 1800000 }],
        shippingAddress: {
            recipient: 'Abhi X',
            phone: '9876543210',
            line1: 'Connaught Place',
            city: 'New Delhi',
            region: 'Delhi',
            postal_code: '110001',
        },
        paymentMethod: 'razorpay',
    });

    assert.ok(freshOrder);
    assert.equal(freshOrder.status, 'paid');

    // 2. Successfully cancel the fresh order
    const cancelRes = await ordersService.cancelOrder(freshOrder.id, { reason: 'Changed mind' });
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.order.status, 'cancelled');
    assert.equal(cancelRes.order.cancel_reason, 'Changed mind');
    assert.ok(cancelRes.order.cancelled_at);

    // Check persistence
    const { data: cancelledOrder } = await ordersService.getOrder(freshOrder.id);
    assert.equal(cancelledOrder.status, 'cancelled');

    // 3. Attempt to cancel an already-cancelled order should throw
    await assert.rejects(
        () => ordersService.cancelOrder(freshOrder.id, { reason: 'Try again' }),
        /already been cancelled/
    );

    // 4. Create an old order (> 24 hours ago) and assert rejection
    const oldOrder = {
        id: 'ST-2026-OLD1',
        status: 'paid',
        total_amount_minor: 1200000,
        created_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(), // 30 hours ago
        items: [],
    };
    savePreviewOrder(oldOrder);

    await assert.rejects(
        () => ordersService.cancelOrder(oldOrder.id),
        /Orders can only be cancelled within 24 hours of placement/
    );

    // 5. Create a delivered order and assert rejection
    const deliveredOrder = {
        id: 'ST-2026-DLV1',
        status: 'delivered',
        total_amount_minor: 1500000,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        items: [],
    };
    savePreviewOrder(deliveredOrder);

    await assert.rejects(
        () => ordersService.cancelOrder(deliveredOrder.id),
        /Delivered orders cannot be cancelled/
    );
});

test('OrderConfirmation UI adheres to SoleThief luxury design system contracts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const jsxContent = fs.readFileSync(path.resolve('src/pages/OrderConfirmation.jsx'), 'utf-8');
    const cssContent = fs.readFileSync(path.resolve('src/pages/OrderConfirmation.css'), 'utf-8');

    // 1. Verify CSS import and isolation
    assert.ok(jsxContent.includes("import './OrderConfirmation.css'"));

    // 2. Verify design tokens in CSS match the site palette
    assert.ok(cssContent.includes('#FAF7F2'), 'Matches warm ivory card background token');
    assert.ok(cssContent.includes('#151B2B') || cssContent.includes('#151b2b'), 'Matches deep indigo ink token');
    assert.ok(cssContent.includes('#C8A96E') || cssContent.includes('#c8a96e'), 'Matches gold luxury accent token');
    assert.ok(cssContent.includes('--font-mono'), 'Uses Space Mono typography');
    assert.ok(cssContent.includes('--font-heading'), 'Uses Anton heading typography');

    // 3. Verify core component structure in JSX
    assert.ok(jsxContent.includes('confirmReceiptVault'));
    assert.ok(jsxContent.includes('confirmVaultHeader'));
    assert.ok(jsxContent.includes('confirmStatusBadgeModern'));
    assert.ok(jsxContent.includes('confirmTrackerWrap'));
    assert.ok(jsxContent.includes('confirmInfoGrid'));
    assert.ok(jsxContent.includes('confirmItemsSection'));
    assert.ok(jsxContent.includes('confirmBreakdownGrid'));
    assert.ok(jsxContent.includes('handleCopyOrderId'));
    assert.ok(jsxContent.includes('handlePrint'));
});

test('payment gateway settings schema, redaction, and loadPublic contract', async () => {
    const {
        DEFAULT_GLOBAL_SETTINGS,
        redactPaymentSettings,
        createGlobalSettingsService,
        STORAGE_KEY,
    } = await import('../src/services/globalSettings.js');

    // 1. Verify schema defaults
    assert.ok(DEFAULT_GLOBAL_SETTINGS.payment, 'Payment object exists in global settings');
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.provider, 'razorpay');
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.enabled, false);
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.maintenance, false);
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.mode, 'test');
    assert.ok(DEFAULT_GLOBAL_SETTINGS.payment.maintenanceMessage.includes('maintenance'));
    assert.ok(DEFAULT_GLOBAL_SETTINGS.payment.cod, 'COD sub-config exists');
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.cod.enabled, true);
    assert.equal(DEFAULT_GLOBAL_SETTINGS.payment.cod.maintenance, false);

    // 2. Redaction security test: secretKey must NEVER be leaked
    const withSecret = {
        payment: {
            provider: 'razorpay',
            enabled: true,
            mode: 'live',
            keyId: 'rzp_live_test_12345',
            secretKey: 'SUPER_SECRET_KEY_NEVER_EXPOSE',
            webhookSecret: 'whsec_test',
        },
    };

    const redacted = redactPaymentSettings(withSecret);
    assert.equal(redacted.payment.secretKey, undefined, 'Secret key must be stripped');
    assert.equal(redacted.payment.secretConfigured, true, 'secretConfigured flag set to true');
    assert.equal(redacted.payment.keyId, 'rzp_live_test_12345', 'Public key ID preserved');

    // 3. loadPublic in preview mode
    mockStore.clear();
    const service = createGlobalSettingsService(() => ({ status: 'missing', client: null }), { storage: storageMock });
    const publicRes = await service.loadPublic();
    assert.ok(publicRes.settings);
    assert.equal(publicRes.settings.payment.secretKey, undefined);
    assert.equal(publicRes.source, 'preview');

    // 4. Save and load via preview storage
    const customSettings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        payment: {
            ...DEFAULT_GLOBAL_SETTINGS.payment,
            enabled: true,
            maintenance: true,
            maintenanceMessage: 'Emergency maintenance underway.',
        },
    };
    await service.save(customSettings);
    const savedPublic = await service.loadPublic();
    assert.equal(savedPublic.settings.payment.maintenance, true);
    assert.equal(savedPublic.settings.payment.maintenanceMessage, 'Emergency maintenance underway.');
});

test('Checkout and Admin enforce payment gateway controls, maintenance badges, and validation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const adminJsx = fs.readFileSync(path.resolve('src/pages/Admin.jsx'), 'utf-8');
    const checkoutJsx = fs.readFileSync(path.resolve('src/pages/Checkout.jsx'), 'utf-8');
    const commerceCss = fs.readFileSync(path.resolve('src/commerce/commerce.css'), 'utf-8');

    // 1. Admin UI contracts
    assert.ok(adminJsx.includes('PaymentGatewayManager'), 'Admin renders PaymentGatewayManager');
    assert.ok(adminJsx.includes('PAYMENT GATEWAYS'), 'Admin has PAYMENT GATEWAYS navigation tab');
    assert.ok(adminJsx.includes('Emergency Maintenance Mode'), 'Admin has Emergency Maintenance toggle');
    assert.ok(adminJsx.includes('updatePayment(\'maintenance\''), 'Admin tracks maintenance state');
    assert.ok(adminJsx.includes('testPaymentConnection'), 'Admin wires server-side connection testing');

    // 2. Checkout UI & logic contracts
    assert.ok(checkoutJsx.includes('createGlobalSettingsService'), 'Checkout imports settings service');
    assert.ok(checkoutJsx.includes('isRazorpayMaintenance'), 'Checkout checks Razorpay maintenance');
    assert.ok(checkoutJsx.includes('isRazorpaySelectable'), 'Checkout computes selectable status');
    assert.ok(checkoutJsx.includes('MAINTENANCE MODE ON'), 'Checkout renders MAINTENANCE MODE ON badge');
    assert.ok(checkoutJsx.includes('checkoutMaintenanceBadge'), 'Checkout uses checkoutMaintenanceBadge CSS');
    assert.ok(checkoutJsx.includes('disabled={!isRazorpaySelectable}'), 'Checkout disables maintenance options');
    assert.ok(checkoutJsx.includes('isAnyPaymentAvailable'), 'Checkout checks if any gateway is active');

    // 3. Unconfigured Key ID safety guard
    assert.ok(
        checkoutJsx.includes('!razorpayConfig.keyId') &&
        checkoutJsx.includes('Razorpay is not yet configured with an API Key ID'),
        'Checkout guards against placing orders when Razorpay key ID is unconfigured'
    );

    // 4. CSS styling contracts
    assert.ok(commerceCss.includes('.checkoutMaintenanceBadge'), 'CSS defines .checkoutMaintenanceBadge');
    assert.ok(commerceCss.includes('.badgeMaintenance'), 'CSS defines .badgeMaintenance');
    assert.ok(commerceCss.includes('.checkoutRadioOption.isUnavailable'), 'CSS defines disabled option styling');
    assert.ok(commerceCss.includes('.checkoutAlertBanner.isMaintenance'), 'CSS defines maintenance banner styling');
});


