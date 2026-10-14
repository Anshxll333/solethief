import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    canReplaceOrder,
    getReplacementRemainingTime,
    savePreviewOrder,
    getPreviewOrderById,
} from '../src/commerce/orders.js';
import { createOrdersService } from '../src/services/orders.js';
import { createAdminService } from '../src/services/admin.js';

test('Order Replacement Policy: canReplaceOrder and getReplacementRemainingTime enforce 3-day window strictly', () => {
    const baseDeliveredAt = '2026-10-10T12:00:00.000Z';
    const deliveredOrder = {
        id: 'ST-2026-TEST',
        status: 'delivered',
        delivered_at: baseDeliveredAt,
        created_at: '2026-10-08T10:00:00.000Z',
    };

    // Exactly 1 day after delivery (within 3 days) -> eligible
    const timeWithin1Day = new Date('2026-10-11T12:00:00.000Z').getTime();
    assert.equal(canReplaceOrder(deliveredOrder, timeWithin1Day), true);

    const remaining = getReplacementRemainingTime(deliveredOrder, timeWithin1Day);
    assert.ok(remaining);
    assert.equal(remaining.days, 2);
    assert.ok(remaining.formatted.includes('2d'));

    // Exactly 2 days and 23 hours after delivery -> eligible
    const timeWithin3Days = new Date('2026-10-13T11:00:00.000Z').getTime();
    assert.equal(canReplaceOrder(deliveredOrder, timeWithin3Days), true);

    // Exactly 3 days + 1 minute after delivery -> expired
    const timeAfter3Days = new Date('2026-10-13T12:01:00.000Z').getTime();
    assert.equal(canReplaceOrder(deliveredOrder, timeAfter3Days), false);
    assert.equal(getReplacementRemainingTime(deliveredOrder, timeAfter3Days), null);

    // Non-delivered orders are NEVER eligible for replacement
    assert.equal(canReplaceOrder({ ...deliveredOrder, status: 'shipped' }, timeWithin1Day), false);
    assert.equal(canReplaceOrder({ ...deliveredOrder, status: 'paid' }, timeWithin1Day), false);
    assert.equal(canReplaceOrder({ ...deliveredOrder, status: 'cancelled' }, timeWithin1Day), false);

    // Already replaced order cannot be replaced again
    assert.equal(canReplaceOrder({ ...deliveredOrder, status: 'replaced' }, timeWithin1Day), false);
    assert.equal(canReplaceOrder({ ...deliveredOrder, replacement_requested: true }, timeWithin1Day), false);
});

test('Customer Replacement Flow: requestReplacement saves replacement reasons and preferred size', async () => {
    // Setup mock localStorage in node test environment
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };

    const now = Date.now();
    const testOrder = {
        id: 'ST-2026-REP9',
        status: 'delivered',
        delivered_at: new Date(now - 1000 * 60 * 60).toISOString(), // 1 hour ago
        items: [
            { id: 'item-1', name: 'Air Jordan 1 Chicago', size: '10', quantity: 1, unit_price_minor: 1800000 }
        ],
        total_amount_minor: 1800000,
    };

    savePreviewOrder(testOrder);

    const ordersService = createOrdersService(() => ({ previewMode: true }));
    const result = await ordersService.requestReplacement('ST-2026-REP9', {
        reason: 'Size too small (Need larger size)',
        preferredSize: 'US 11',
        notes: 'Please exchange for US 11 brand new deadstock.',
        allowPreview: true,
    });

    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.order.replacement_requested, true);
    assert.equal(result.order.replacement_status, 'requested');
    assert.equal(result.order.replacement_reason, 'Size too small (Need larger size)');
    assert.equal(result.order.replacement_preferred_size, 'US 11');

    // Verify persisted in storage
    const stored = getPreviewOrderById('ST-2026-REP9');
    assert.equal(stored.replacement_requested, true);
    assert.equal(stored.replacement_preferred_size, 'US 11');
});

test('Admin Order Rejection & Acceptance: sets rejection reason and updates lifecycle', async () => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
    };

    const orderToReject = {
        id: 'ST-2026-REJ1',
        status: 'paid',
        items: [{ id: 'shoe-1', name: 'Travis Scott Low', size: '9' }],
        total_amount_minor: 4500000,
    };
    savePreviewOrder(orderToReject);

    const adminService = createAdminService(() => ({ status: 'missing', client: null }));

    // Reject order with reason
    const rejected = await adminService.updateOrderStatus('ST-2026-REJ1', 'cancelled', {
        rejectionReason: 'Authenticity verification failed during vault inspection',
        notes: 'Pair failed stitching and blacklight test in vault.',
        allowPreview: true,
    });

    assert.equal(rejected.status, 'cancelled');
    assert.equal(rejected.rejection_reason, 'Authenticity verification failed during vault inspection');
    assert.equal(rejected.cancel_reason, 'Authenticity verification failed during vault inspection');
    assert.equal(rejected.cancelled_by, 'admin');

    // Verify stored
    const storedRejected = getPreviewOrderById('ST-2026-REJ1');
    assert.equal(storedRejected.status, 'cancelled');
    assert.equal(storedRejected.rejection_reason, 'Authenticity verification failed during vault inspection');
});

test('ProductDetails.jsx contains 3 Days Replacement badge alongside Quality Checked', async () => {
    const pdCode = await fs.readFile(path.resolve('src/components/ProductDetails.jsx'), 'utf8');

    assert.ok(pdCode.includes('3 Days Replacement'), 'ProductDetails must include 3 Days Replacement trust badge');
    assert.ok(pdCode.includes('Quality Checked'), 'ProductDetails must preserve Quality Checked badge');
    assert.ok(pdCode.includes('RotateCcw'), 'ProductDetails must use RotateCcw icon for replacement badge');
});

test('Account navigation tabs eliminate horizontal slider/scrollbar', async () => {
    const accCss = await fs.readFile(path.resolve('src/pages/Account.css'), 'utf8');
    const commCss = await fs.readFile(path.resolve('src/commerce/commerce.css'), 'utf8');

    // Neither Account.css nor commerce.css should force overflow-x: auto on accountNavTabs
    assert.ok(!accCss.includes('overflow-x: auto;'), 'Account.css must not use overflow-x: auto on accountNavTabs');
    assert.ok(accCss.includes('overflow-x: visible;'), 'Account.css must set overflow-x: visible on accountNavTabs');
    assert.ok(accCss.includes('flex-wrap: wrap;'), 'Account.css must allow flex-wrap on accountNavTabs');
    assert.ok(commCss.includes('overflow-x: visible;'), 'commerce.css must set overflow-x: visible on accountNavTabs');
});

test('Admin.jsx contains Accept/Reject quick actions, Rejection modal, and Operator fulfillment upgrades', async () => {
    const adminCode = await fs.readFile(path.resolve('src/pages/Admin.jsx'), 'utf8');

    assert.ok(adminCode.includes('handleQuickAcceptOrder'), 'Admin.jsx must include handleQuickAcceptOrder');
    assert.ok(adminCode.includes('handleOpenRejectModal'), 'Admin.jsx must include handleOpenRejectModal');
    assert.ok(adminCode.includes('rejectModalOrder'), 'Admin.jsx must manage rejectModalOrder state');
    assert.ok(adminCode.includes('OPERATOR FULFILLMENT ACTION'), 'Admin.jsx must contain OPERATOR FULFILLMENT ACTION module');
    assert.ok(adminCode.includes('operatorLifecycleStepper'), 'Admin.jsx must render operatorLifecycleStepper');
    assert.ok(adminCode.includes('handleGenerateAwb'), 'Admin.jsx must include handleGenerateAwb');
});

test('Account.jsx displays rejection reason and replaces Cancel with 3-Day Replace for delivered orders', async () => {
    const accountCode = await fs.readFile(path.resolve('src/pages/Account.jsx'), 'utf8');

    assert.ok(accountCode.includes('canReplaceOrder'), 'Account.jsx must import and check canReplaceOrder');
    assert.ok(accountCode.includes('orderReplaceBtn'), 'Account.jsx must render orderReplaceBtn for delivered orders');
    assert.ok(accountCode.includes('replaceModalContent'), 'Account.jsx must render replaceModalContent');
    assert.ok(accountCode.includes('orderItemRejectionNotice'), 'Account.jsx must show orderItemRejectionNotice for cancelled items');
    assert.ok(accountCode.includes('order.rejection_reason'), 'Account.jsx must surface order.rejection_reason');
});
