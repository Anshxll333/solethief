import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Setup mock window/localStorage for Node test runner
const mockStore = new Map();
const storageMock = {
    getItem: (key) => mockStore.get(key) || null,
    setItem: (key, val) => mockStore.set(key, String(val)),
    removeItem: (key) => mockStore.delete(key),
    clear: () => mockStore.clear(),
};
globalThis.localStorage = storageMock;
if (typeof globalThis.window === 'undefined') {
    globalThis.window = { localStorage: storageMock, dispatchEvent: () => {} };
} else {
    globalThis.window.localStorage = storageMock;
}

const {
    getPreviewDrops,
    savePreviewDrops,
    decrementPreviewStock,
    restorePreviewStock,
    ADMIN_STORAGE_DROPS_KEY,
} = await import('../src/commerce/admin.js');

const { createOrdersService } = await import('../src/services/orders.js');

test('ProductDetails: JSX contains strict disabled state, aria attributes, and OUT OF STOCK handling', () => {
    const jsx = readFileSync('src/components/ProductDetails.jsx', 'utf8');

    // Size pill disabled check when sold or quantity <= 0
    assert.match(jsx, /const\s+isSoldOut\s*=\s*Boolean\(size\.sold\s*\|\|\s*size\.quantity\s*<=\s*0\);/);
    assert.match(jsx, /disabled=\{isSoldOut\}/);
    assert.match(jsx, /aria-disabled=\{isSoldOut\}/);
    assert.match(jsx, /tabIndex=\{isSoldOut\s*\?\s*-1\s*:\s*0\}/);

    // Clicking sold-out size pill must not select it
    assert.match(jsx, /if\s*\(!isSoldOut\)\s*\{\s*setSelectedSize\(size\.value\);/);

    // Selected size syncs away from out-of-stock sizes
    assert.match(jsx, /firstAvailableSize/);
    assert.match(jsx, /currentVariant\.sold\s*\|\|\s*currentVariant\.quantity\s*<=\s*0/);

    // Add to Bag button is disabled when selected size is sold out or stock <= 0
    assert.match(jsx, /disabled=\{!enabled\s*\|\|\s*full\s*\|\|\s*isSelectedSoldOut\s*\|\|\s*availableStock\s*<=\s*0\}/);

    // Add to Bag displays 'OUT OF STOCK' when selected size is sold out or all sizes sold out
    assert.match(jsx, /isSelectedSoldOut\s*\|\|\s*allSizesSoldOut\s*\?\s*\(?\s*['"]OUT OF STOCK['"]/);

    // Must preserve `ADD TO BAG (${selectedSize})` contract for active available sizes
    assert.match(jsx, /`ADD TO BAG \(\$\{selectedSize\}\)`/);

    // handleActionClick strictly blocks addition when sold out or availableStock <= 0
    assert.match(jsx, /if\s*\(full\s*\|\|\s*!shoe\s*\|\|\s*isSelectedSoldOut\s*\|\|\s*!selectedSize\s*\|\|\s*availableStock\s*<=\s*0\)\s*return;/);
});

test('ProductDetails: CSS includes Flipkart/Amazon style disabled size styling with diagonal strike', () => {
    const css = readFileSync('src/index.css', 'utf8');

    // Disabled / sold-out size pill styles
    assert.match(css, /\.pairSizePill\.isSoldOut,\s*\.pairSizePill:disabled\s*\{/);
    assert.match(css, /cursor:\s*not-allowed/);
    assert.match(css, /text-decoration:\s*line-through/);

    // Diagonal strike line across disabled size pill
    assert.match(css, /\.pairSizePill\.isSoldOut::after,\s*\.pairSizePill:disabled::after\s*\{/);
    assert.match(css, /transform:\s*rotate\(-24deg\)/);

    // Out of stock Add to Bag button styling
    assert.match(css, /\.pairAddToBagBtn\.isSoldOut\s*\{/);
});

test('CommerceProvider: add function strictly prevents adding out-of-stock sizes to the bag', () => {
    const providerJsx = readFileSync('src/commerce/CommerceProvider.jsx', 'utf8');

    // Guard inside add function
    assert.match(providerJsx, /if\s*\(sizeVariant\s*&&\s*\(sizeVariant\.sold\s*\|\|\s*\(typeof\s+sizeVariant\.quantity\s*===\s*'number'\s*&&\s*sizeVariant\.quantity\s*<=\s*0\)\)\)\s*\{\s*return;/);
});

test('decrementPreviewStock: decrements size quantity and marks sold when quantity hits zero', () => {
    mockStore.clear();

    const sampleDrop = {
        id: 101,
        name: 'ST-VAULT HIGH',
        brand: 'SOLETHIEF',
        size: 'US 9',
        price: '22,000.00',
        priceMinor: 2200000,
        currency: 'INR',
        frontImage: '/shoes/transparent/shoe-1-front.png',
        sideImage: '/shoes/transparent/shoe-1-side.png',
        active: true,
        sizes: [
            { value: 'US 8', quantity: 2, sold: false },
            { value: 'US 9', quantity: 1, sold: false },
            { value: 'US 10', quantity: 0, sold: true },
        ],
    };

    savePreviewDrops([sampleDrop]);

    // Decrement US 8 by 1 -> quantity becomes 1, sold remains false
    const rem8 = decrementPreviewStock(101, 'US 8', 1);
    assert.equal(rem8, 1);

    const dropsAfterFirst = getPreviewDrops();
    const drop1 = dropsAfterFirst.find((d) => d.id === 101);
    const var8 = drop1.sizes.find((s) => s.value === 'US 8');
    assert.equal(var8.quantity, 1);
    assert.equal(var8.sold, false);

    // Decrement US 9 by 1 (hits 0) -> quantity becomes 0, sold becomes true (disabled)
    const rem9 = decrementPreviewStock(101, 'US 9', 1);
    assert.equal(rem9, 0);

    const dropsAfterSecond = getPreviewDrops();
    const drop2 = dropsAfterSecond.find((d) => d.id === 101);
    const var9 = drop2.sizes.find((s) => s.value === 'US 9');
    assert.equal(var9.quantity, 0);
    assert.equal(var9.sold, true);

    // Attempting to decrement US 9 again must throw Insufficient stock
    assert.throws(() => decrementPreviewStock(101, 'US 9', 1), /Insufficient stock/);
});

test('createOrdersService: order creation decrements size quantity and cancellation restores it', async () => {
    mockStore.clear();

    const sampleDrop = {
        id: 202,
        name: 'ST-SHIBUYA LOW',
        brand: 'SOLETHIEF',
        size: 'US 9',
        price: '18,000.00',
        priceMinor: 1800000,
        currency: 'INR',
        frontImage: '/shoes/transparent/shoe-2-front.png',
        sideImage: '/shoes/transparent/shoe-2-side.png',
        active: true,
        sizes: [
            { value: 'US 9', quantity: 1, sold: false },
        ],
    };

    savePreviewDrops([sampleDrop]);

    const ordersService = createOrdersService(() => ({ previewMode: true }));

    const orderRes = await ordersService.createOrder({
        items: [
            {
                id: 202,
                name: 'ST-SHIBUYA LOW',
                brand: 'SOLETHIEF',
                size: 'US 9',
                quantity: 1,
                priceMinor: 1800000,
                frontImage: '/shoes/transparent/shoe-2-front.png',
            },
        ],
        shippingAddress: {
            recipient: 'Kabir Verma',
            phone: '9812345678',
            line1: 'B-12 Connaught Place',
            city: 'New Delhi',
            region: 'Delhi',
            postal_code: '110001',
        },
    });

    assert.equal(orderRes.success, true);

    // Check that US 9 quantity hit 0 and is marked sold (disabled)
    const dropsAfterOrder = getPreviewDrops();
    const orderedDrop = dropsAfterOrder.find((d) => d.id === 202);
    const us9 = orderedDrop.sizes.find((s) => s.value === 'US 9');
    assert.equal(us9.quantity, 0);
    assert.equal(us9.sold, true);

    // Cancel order -> restores quantity back to 1 and sold to false
    const cancelRes = await ordersService.cancelOrder(orderRes.order.id, { reason: 'Changed size' });
    assert.equal(cancelRes.success, true);

    const dropsAfterCancel = getPreviewDrops();
    const restoredDrop = dropsAfterCancel.find((d) => d.id === 202);
    const restoredUs9 = restoredDrop.sizes.find((s) => s.value === 'US 9');
    assert.equal(restoredUs9.quantity, 1);
    assert.equal(restoredUs9.sold, false);
});

test('createOrdersService: order creation throws error when requested quantity exceeds available stock', async () => {
    mockStore.clear();

    const sampleDrop = {
        id: 303,
        name: 'ST-LIMITED',
        brand: 'SOLETHIEF',
        size: 'US 9',
        price: '15,000.00',
        priceMinor: 1500000,
        currency: 'INR',
        frontImage: '/shoes/transparent/shoe-3-front.png',
        sideImage: '/shoes/transparent/shoe-3-side.png',
        active: true,
        sizes: [
            { value: 'US 9', quantity: 2, sold: false },
        ],
    };

    savePreviewDrops([sampleDrop]);

    const ordersService = createOrdersService(() => ({ previewMode: true }));

    await assert.rejects(
        () => ordersService.createOrder({
            items: [
                {
                    id: 303,
                    name: 'ST-LIMITED',
                    brand: 'SOLETHIEF',
                    size: 'US 9',
                    quantity: 5, // exceeds available stock (2)
                    priceMinor: 1500000,
                    frontImage: '/shoes/transparent/shoe-3-front.png',
                },
            ],
            shippingAddress: {
                recipient: 'Anita Roy',
                phone: '9812345678',
                line1: '15 Park Street',
                city: 'Kolkata',
                region: 'West Bengal',
                postal_code: '700016',
            },
        }),
        /Insufficient stock/
    );
});
