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
    ADMIN_STORAGE_DROPS_KEY,
    ADMIN_STORAGE_INVENTORY_KEY,
    ADMIN_STORAGE_OPERATOR_KEY,
    INVENTORY_STATES,
    VERIFICATION_STATUSES,
    ADMIN_FULFILLMENT_TRANSITIONS,
    isValidAdminStatusTransition,
    validateDropInput,
    validateInventoryPairState,
    calculateOperationalMetrics,
    getPreviewDrops,
    savePreviewDrops,
    getPreviewInventory,
    savePreviewInventory,
} = await import('../src/commerce/admin.js');

const { createAdminService } = await import('../src/services/admin.js');

const validLiveDrop = {
    id: 901,
    name: 'TOKYO TEST',
    brand: 'Archive',
    size: 'US 9',
    priceMinor: 1250000,
    frontImage: '/front.png',
    sideImage: '/side.png',
    active: false,
};

test('live authorization requires strict boolean true and fails closed on RPC errors', async () => {
    for (const data of [false, null, undefined, 'true', 1, {}, { role: 'admin' }, [true]]) {
        const service = createAdminService(() => ({
            status: 'configured', client: { rpc: async () => ({ data, error: null }) },
        }));
        const access = await service.checkAdminAccess({ user: { id: 'admin' } });
        assert.equal(access.isAdmin, false);
        assert.equal(access.role, null);
    }
    for (const rpc of [
        async () => ({ data: true, error: { message: 'denied' } }),
        async () => { throw new Error('offline'); },
        async () => null,
    ]) {
        const service = createAdminService(() => ({ status: 'configured', client: { rpc } }));
        const access = await service.checkAdminAccess({ user: { id: 'admin' } });
        assert.equal(access.isAdmin, false);
        assert.equal(access.mode, 'live');
        assert.ok(access.error);
    }
});

test('every admin method rejects invalid runtime without touching demo storage or network', async () => {
    const client = {
        from: () => assert.fail('Unexpected table request'),
        rpc: () => assert.fail('Unexpected RPC'),
    };
    for (const runtime of [
        { status: 'invalid', client: null },
        { status: 'invalid', client },
        { status: 'configured', client: null },
        { status: 'missing', client },
        { status: 'unknown', client: null },
        {}, null, undefined,
    ]) {
        mockStore.clear();
        const service = createAdminService(() => runtime);
        const invocations = {
            checkAdminAccess: () => service.checkAdminAccess(),
            getOperatorSession: () => service.getOperatorSession(),
            setOperatorSession: () => service.setOperatorSession({ isOperator: true }),
            getOperationalMetrics: () => service.getOperationalMetrics(),
            listDrops: () => service.listDrops(),
            createDrop: () => service.createDrop(validLiveDrop),
            updateDrop: () => service.updateDrop(1, { active: false }),
            listInventory: () => service.listInventory(),
            updateInventoryPair: () => service.updateInventoryPair(1, { state: 'available' }),
            listOrders: () => service.listOrders(),
            updateOrderStatus: () => service.updateOrderStatus('ST-2026-SHIB', 'shipped'),
            generateDropId: () => service.generateDropId(),
        };
        assert.deepEqual(Object.keys(invocations).sort(), Object.keys(service).sort());
        for (const invoke of Object.values(invocations)) {
            await assert.rejects(async () => invoke(), /configuration is invalid/);
            assert.equal(mockStore.size, 0);
        }
    }
});

test('live create uses only the atomic RPC with explicit ID and migration fields', async () => {
    mockStore.clear();
    mockStore.set(ADMIN_STORAGE_DROPS_KEY, 'corrupt preview store');
    const before = [...mockStore];
    const calls = [];
    const row = { id: 901, active: false };
    const service = createAdminService(() => ({
        status: 'configured',
        client: {
            from: () => assert.fail('No direct product or inventory writes'),
            rpc: async (...args) => { calls.push(args); return { data: row, error: null }; },
        },
    }));
    assert.equal(service.generateDropId(), '');
    assert.throws(() => service.getOperatorSession(), /local demo/);
    assert.throws(() => service.setOperatorSession({ isOperator: true }), /local demo/);
    assert.equal(await service.createDrop({ ...validLiveDrop, description: 'Not a DB field' }), row);
    assert.deepEqual(calls, [['admin_create_shop_product', {
        p_product: {
            id: 901, name: 'TOKYO TEST', brand: 'ARCHIVE', size: 'US 9',
            price_minor: 1250000, currency: 'INR', front_image: '/front.png',
            side_image: '/side.png', active: false,
        }
    }]]);
    for (const id of [undefined, null, '', 0, -1, 1.5]) {
        await assert.rejects(() => service.createDrop({ ...validLiveDrop, id }), /ID/);
    }
    assert.equal(calls.length, 1);
    assert.deepEqual([...mockStore], before);
    mockStore.clear();
});

test('live create surfaces conflicts and inventory/RPC failures without fallback or retry', async () => {
    for (const error of [
        { code: '23505', message: 'duplicate key violates products_pkey' },
        { code: '42501', message: 'Shop administrator required' },
        { code: '23514', message: 'inventory constraint failed' },
    ]) {
        mockStore.clear();
        let calls = 0;
        const service = createAdminService(() => ({
            status: 'configured', client: {
                from: () => assert.fail('Unexpected direct write'),
                rpc: async () => { calls += 1; return { data: null, error }; },
            },
        }));
        await assert.rejects(() => service.createDrop(validLiveDrop), failure => {
            assert.equal(failure.cause, error);
            assert.ok(failure.message.includes(error.message));
            return true;
        });
        assert.equal(calls, 1);
        assert.equal(mockStore.size, 0);
    }
    const service = createAdminService(() => ({
        status: 'configured', client: { rpc: async () => { throw new Error('Network failed'); } },
    }));
    await assert.rejects(() => service.createDrop(validLiveDrop), /Network failed/);
    assert.equal(mockStore.size, 0);
});

test('admin domain contracts and constants match schema expectations', () => {
    assert.equal(ADMIN_STORAGE_DROPS_KEY, 'solethief.admin.drops.v1');
    assert.equal(ADMIN_STORAGE_INVENTORY_KEY, 'solethief.admin.inventory.v1');
    assert.equal(ADMIN_STORAGE_OPERATOR_KEY, 'solethief.admin.operator.v1');

    assert.ok(INVENTORY_STATES.includes('available'));
    assert.ok(INVENTORY_STATES.includes('reserved'));
    assert.ok(INVENTORY_STATES.includes('sold'));
    assert.ok(INVENTORY_STATES.includes('archived'));
    assert.ok(INVENTORY_STATES.includes('unavailable'));

    assert.ok(VERIFICATION_STATUSES.includes('verified'));
    assert.ok(VERIFICATION_STATUSES.includes('authenticating'));
    assert.ok(VERIFICATION_STATUSES.includes('unverified'));

    assert.ok(validateInventoryPairState('available'));
    assert.ok(validateInventoryPairState('reserved'));
    assert.ok(validateInventoryPairState('sold'));
    assert.ok(validateInventoryPairState('archived'));
    assert.equal(validateInventoryPairState('damaged_destroyed_bogus'), false);

    assert.ok(Array.isArray(ADMIN_FULFILLMENT_TRANSITIONS.pending_payment));
    assert.ok(Array.isArray(ADMIN_FULFILLMENT_TRANSITIONS.authenticating));

    const drops = getPreviewDrops();
    assert.ok(Array.isArray(drops));
    savePreviewDrops(drops);

    const inventory = getPreviewInventory();
    assert.ok(inventory && typeof inventory === 'object');
    savePreviewInventory(inventory);
});

test('operator access control in preview mode toggles correctly', async () => {
    mockStore.clear();
    const service = createAdminService(() => ({ status: 'missing', client: null }));

    // Default session has operator active
    const accessActive = await service.checkAdminAccess();
    assert.equal(accessActive.isAdmin, true);
    assert.equal(accessActive.mode, 'preview');
    assert.equal(accessActive.role, 'admin');

    // Toggle off operator
    service.setOperatorSession({ isOperator: false, role: 'viewer', operatorId: null });
    const accessInactive = await service.checkAdminAccess();
    assert.equal(accessInactive.isAdmin, false);
    assert.equal(accessInactive.mode, 'preview');
    assert.match(accessInactive.error, /restricted/i);

    // Toggle back on
    service.setOperatorSession({ isOperator: true, role: 'admin', operatorId: 'op_shibuya_test' });
    const accessRestored = await service.checkAdminAccess();
    assert.equal(accessRestored.isAdmin, true);
    assert.equal(accessRestored.operatorId, 'op_shibuya_test');
});

test('live mode uses the JWT authorization RPC and isolates non-admin users', async () => {
    let authorized = false;
    let calls = 0;
    const fakeClient = {
        from: () => assert.fail('Authorization must not query tables'),
        rpc: async (...args) => {
            assert.deepEqual(args, ['is_shop_admin']);
            calls += 1;
            return { data: authorized, error: null };
        },
    };

    const liveService = createAdminService(() => ({
        status: 'configured',
        client: fakeClient,
    }));

    // 1. Unauthenticated in live mode is rejected
    const unauth = await liveService.checkAdminAccess({ user: null });
    assert.equal(unauth.isAdmin, false);
    assert.equal(unauth.mode, 'live');
    assert.match(unauth.error, /Authentication required/i);

    assert.equal(calls, 0);

    // 2. Regular user is denied access
    const regular = await liveService.checkAdminAccess({
        user: { id: 'usr_regular_customer', email: 'customer@example.com' },
    });
    assert.equal(regular.isAdmin, false);
    assert.equal(regular.mode, 'live');
    assert.match(regular.error, /not granted admin permissions/i);

    // Authorization comes from the RPC, not the supplied user object.
    authorized = true;
    const adminUser = await liveService.checkAdminAccess({
        user: { id: 'usr_admin_kenji', email: 'kenji@solethief.in' },
    });
    assert.equal(adminUser.isAdmin, true);
    assert.equal(adminUser.mode, 'live');
    assert.equal(adminUser.role, 'admin');
    assert.equal(adminUser.error, null);
});

test('validateDropInput strictly enforces fields and prevents invalid pricing or IDs', () => {
    // Valid input
    const valid = validateDropInput({
        id: 5,
        name: 'GEL-KAYANO 14 RETRO',
        brand: 'SoleThief ASICS',
        size: 'US 10.5',
        price: '21500.00',
        frontImage: '/shoes/transparent/shoe-1-front.png',
        sideImage: '/shoes/transparent/shoe-1-side.png',
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.normalized.id, 5);
    assert.equal(valid.normalized.priceMinor, 2150000);
    assert.equal(valid.normalized.currency, 'INR');
    assert.equal(valid.normalized.brand, 'SOLETHIEF ASICS');

    // Invalid: negative or non-integer price
    const invalidPrice = validateDropInput({
        id: 6,
        name: 'INVALID PAIR',
        brand: 'TEST',
        size: 'US 9',
        priceMinor: -500,
        frontImage: '/shoe.png',
        sideImage: '/shoe.png',
    });
    assert.equal(invalidPrice.valid, false);
    assert.ok(invalidPrice.errors.price);

    // Invalid: missing ID or non-integer ID
    const invalidId = validateDropInput({
        id: -1,
        name: 'INVALID ID',
        brand: 'TEST',
        size: 'US 9',
        price: '1000',
        frontImage: '/shoe.png',
        sideImage: '/shoe.png',
    });
    assert.equal(invalidId.valid, false);
    assert.ok(invalidId.errors.id);

    // Invalid: empty name or images
    const emptyFields = validateDropInput({
        id: 7,
        name: '',
        brand: 'TEST',
        size: 'US 9',
        price: '1000',
        frontImage: '',
        sideImage: '',
    });
    assert.equal(emptyFields.valid, false);
    assert.ok(emptyFields.errors.name);
    assert.ok(emptyFields.errors.frontImage);
});

test('inventory & drops mutations create, update, and toggle inventory states', async () => {
    mockStore.clear();
    const service = createAdminService(() => ({ status: 'missing', client: null }));

    // Initial drops count
    const initialDrops = await service.listDrops();
    assert.ok(initialDrops.length >= 4);

    // Create new drop #99
    const newDrop = await service.createDrop({
        id: 99,
        name: 'TOKYO STREET V1',
        brand: 'SOLETHIEF ARCHIVE',
        size: 'US 11',
        price: '25000.00',
        frontImage: '/shoes/transparent/shoe-5-front.png',
        sideImage: '/shoes/transparent/shoe-5-side.png',
        active: true,
    });
    assert.equal(newDrop.id, 99);
    assert.equal(newDrop.priceMinor, 2500000);

    // Verify it is in list
    const updatedDrops = await service.listDrops();
    const found = updatedDrops.find((d) => d.id === 99);
    assert.ok(found);
    assert.equal(found.name, 'TOKYO STREET V1');

    // Update drop metadata
    const updated = await service.updateDrop(99, {
        priceMinor: 2750000,
        active: false,
    });
    assert.equal(updated.priceMinor, 2750000);
    assert.equal(updated.active, false);

    // Check inventory state mutation
    const invMap = await service.listInventory();
    assert.ok(invMap[99]);

    // Mutate state to 'reserved'
    const invRes = await service.updateInventoryPair(99, {
        state: 'reserved',
        verified: true,
        verificationStatus: 'verified',
        notes: 'Held for Shibuya VIP drop',
    });
    assert.equal(invRes.state, 'reserved');
    assert.equal(invRes.verified, true);

    // Mutate state to 'archived'
    const invArch = await service.updateInventoryPair(99, {
        state: 'archived',
    });
    assert.equal(invArch.state, 'archived');

    // Rejects invalid state
    await assert.rejects(
        () => service.updateInventoryPair(99, { state: 'not_a_real_state' }),
        /Invalid inventory state/
    );
});

test('order fulfillment operations enforce streetwear lifecycle transitions', async () => {
    mockStore.clear();
    const service = createAdminService(() => ({ status: 'missing', client: null }));

    const orders = await service.listOrders();
    assert.ok(orders.length >= 2);

    const targetOrder = orders[0];
    const initialStatus = targetOrder.status;
    assert.equal(initialStatus, 'authenticating');

    // Valid transition from 'authenticating' to 'shipped'
    assert.equal(isValidAdminStatusTransition('authenticating', 'shipped'), true);
    const shippedOrder = await service.updateOrderStatus(
        targetOrder.id,
        'shipped',
        'AWB #BLUEDART-TYO-9912 dispatched from Tokyo vault'
    );
    assert.equal(shippedOrder.status, 'shipped');
    assert.equal(shippedOrder.fulfillment_notes, 'AWB #BLUEDART-TYO-9912 dispatched from Tokyo vault');

    // Valid transition from 'shipped' to 'delivered'
    assert.equal(isValidAdminStatusTransition('shipped', 'delivered'), true);
    const deliveredOrder = await service.updateOrderStatus(targetOrder.id, 'delivered');
    assert.equal(deliveredOrder.status, 'delivered');

    // Invalid transition: delivered cannot transition back to confirmed or authenticating
    assert.equal(isValidAdminStatusTransition('delivered', 'confirmed'), false);
    await assert.rejects(
        () => service.updateOrderStatus(targetOrder.id, 'confirmed'),
        /Invalid status transition/
    );
});

test('calculateOperationalMetrics accurately calculates executive KPIs', () => {
    const drops = [
        { id: 1, active: true },
        { id: 2, active: true },
        { id: 3, active: false },
    ];

    const inventory = {
        1: { productId: 1, state: 'available' },
        2: { productId: 2, state: 'available' },
        3: { productId: 3, state: 'reserved' },
        4: { productId: 4, state: 'sold' },
    };

    const orders = [
        { id: 'O1', status: 'paid', total_minor: 1900000 },
        { id: 'O2', status: 'authenticating', total_minor: 1850000 },
        { id: 'O3', status: 'shipped', total_minor: 2200000 },
        { id: 'O4', status: 'cancelled', total_minor: 1500000 },
    ];

    const kpis = calculateOperationalMetrics({ drops, inventory, orders });
    // Total revenue excludes cancelled: 1900000 + 1850000 + 2200000 = 5950000 paise (₹59,500)
    assert.equal(kpis.totalRevenueMinor, 5950000);
    assert.equal(kpis.activeDropsCount, 2);
    assert.equal(kpis.availablePairsCount, 2);
    // Pending shipments: paid + authenticating = 2
    assert.equal(kpis.pendingShipmentsCount, 2);
    assert.equal(kpis.totalOrdersCount, 4);
});
