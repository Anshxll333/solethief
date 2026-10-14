import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shoesData } from '../src/data/shoes.js';
import {
    groupShopProducts,
    shopGroupLocation,
    findShopCategory,
    getCategoryProducts,
    resolveCategorySelection,
    resolveCollectionArtwork,
    DEFAULT_COLLECTION_ARTWORK,
} from '../src/pages/shopGroups.js';

test('Shop groups the real catalog by collection, retaining every individual pair', () => {
    const groups = groupShopProducts(shoesData);
    assert.deepEqual(groups.map(group => group.label), ['TIGER', 'VAPOR', 'RONIN']);
    assert.deepEqual(groups.map(group => group.products.map(product => product.id)), [[1], [2], [3, 4]]);
    assert.equal(groups[2].products[0], shoesData[2]);
    assert.equal(groups[0].image, shoesData[0].sideImage);
});

test('Shop handles empty catalogs and does not invent groups for unknown selections', () => {
    assert.deepEqual(groupShopProducts([]), []);
    assert.equal(groupShopProducts(shoesData).find(group => group.key === 'adidas'), undefined);
});

test('Shop normalizes brand casing and whitespace without merging unrelated brands', () => {
    const products = [
        { id: 1, brand: ' SOLETHIEF   TIGER ' },
        { id: 2, brand: 'solethief tiger', frontImage: '/shoes/transparent/shoe-1-front.png' },
        { id: 3, brand: 'Tiger' },
        { id: 4, brand: 'A+B' },
        { id: 5, brand: 'A B' },
        { id: 6 },
    ];
    const groups = groupShopProducts(products);
    assert.equal(groups.length, 5);
    assert.deepEqual(groups[0].products.map(product => product.id), [1, 2]);
    assert.equal(groups[0].image, products[1].frontImage);
    assert.equal(groups[4].label, 'Other pairs');
    assert.equal(products[0].brand, ' SOLETHIEF   TIGER ');
});

test('Shop selection and return URLs preserve other parameters without mutating them', () => {
    const params = new URLSearchParams('campaign=drop&group=old&group=duplicate');
    const selected = shopGroupLocation(params, 'solethief ronin');
    const parsed = new URL(selected, 'https://example.test');
    assert.equal(parsed.pathname, '/shop');
    assert.deepEqual(parsed.searchParams.getAll('group'), ['solethief ronin']);
    assert.equal(parsed.searchParams.get('campaign'), 'drop');
    const groups = groupShopProducts(shoesData);
    assert.deepEqual(groups.find(group => group.key === parsed.searchParams.get('group')).products.map(product => product.id), [3, 4]);
    assert.equal(shopGroupLocation(parsed.searchParams), '/shop?campaign=drop');
    assert.deepEqual(params.getAll('group'), ['old', 'duplicate']);
    assert.equal(shopGroupLocation(new URLSearchParams()), '/shop');
});

test('Shop query keys round-trip punctuation, Unicode, and unbranded pairs', () => {
    for (const key of ['a+b / c&d', '\u6771\u4eac', '']) {
        const url = new URL(shopGroupLocation(new URLSearchParams(), key), 'https://example.test');
        assert.equal(url.searchParams.get('group'), key);
    }
});

test('findShopCategory matches slug case-insensitively and handles missing or invalid input', () => {
    const categories = [
        { id: 'cat-1', name: 'Tiger Series', slug: 'tiger' },
        { id: 'cat-2', name: 'Vapor Drop', slug: 'vapor' },
    ];

    assert.equal(findShopCategory(categories, 'tiger')?.id, 'cat-1');
    assert.equal(findShopCategory(categories, 'TIGER')?.id, 'cat-1');
    assert.equal(findShopCategory(categories, '  vapor  ')?.id, 'cat-2');
    assert.equal(findShopCategory(categories, 'unknown'), null);
    assert.equal(findShopCategory(categories, ''), null);
    assert.equal(findShopCategory(null, 'tiger'), null);
});

test('getCategoryProducts returns active pairs matching category memberships', () => {
    const category = { id: 'cat-tiger', slug: 'tiger', name: 'Tiger' };
    const memberships = [
        { category_id: 'cat-tiger', product_id: 1 },
        { category_id: 'cat-tiger', product_id: 2 },
        { category_id: 'cat-other', product_id: 3 },
    ];
    const products = [
        { id: 1, name: 'Shoe 1' },
        { id: 2, name: 'Shoe 2' },
        { id: 3, name: 'Shoe 3' },
    ];

    const matched = getCategoryProducts(category, memberships, products);
    assert.deepEqual(matched.map(p => p.id), [1, 2]);

    assert.deepEqual(getCategoryProducts(null, memberships, products), []);
    assert.deepEqual(getCategoryProducts(category, [], products), []);
    assert.deepEqual(getCategoryProducts(category, memberships, []), []);
});

test('resolveCategorySelection resolves directory, ready, empty, hidden, and unavailable states honestly', () => {
    const categories = [
        { id: 'cat-1', slug: 'visible-with-products', name: 'Active', is_visible: true },
        { id: 'cat-2', slug: 'visible-empty', name: 'Empty Cat', is_visible: true },
        { id: 'cat-3', slug: 'visible-flag-false', name: 'Hidden Flag', is_visible: false },
    ];
    const hiddenCategories = [
        { id: 'cat-hidden', slug: 'hidden-only', name: 'Hidden Only', is_visible: false },
    ];
    const memberships = [
        { category_id: 'cat-1', product_id: 10 },
    ];
    const products = [
        { id: 10, name: 'Shoe 10' },
    ];

    // Directory state (no slug selected)
    const dirRes = resolveCategorySelection({ categories, memberships, products, slug: '' });
    assert.equal(dirRes.state, 'directory');
    assert.equal(dirRes.category, null);

    // Ready state (category found and has products)
    const readyRes = resolveCategorySelection({ categories, memberships, products, slug: 'visible-with-products' });
    assert.equal(readyRes.state, 'ready');
    assert.equal(readyRes.category?.id, 'cat-1');
    assert.deepEqual(readyRes.products.map(p => p.id), [10]);

    // Empty state (category found and visible, but 0 products)
    const emptyRes = resolveCategorySelection({ categories, memberships, products, slug: 'visible-empty' });
    assert.equal(emptyRes.state, 'empty');
    assert.equal(emptyRes.category?.id, 'cat-2');
    assert.deepEqual(emptyRes.products, []);

    // Hidden state (category found with is_visible === false)
    const hiddenRes1 = resolveCategorySelection({ categories, memberships, products, slug: 'visible-flag-false' });
    assert.equal(hiddenRes1.state, 'hidden');
    assert.equal(hiddenRes1.category?.id, 'cat-3');

    // Hidden state (category in hiddenCategories preview)
    const hiddenRes2 = resolveCategorySelection({ categories, memberships, products, slug: 'hidden-only', hiddenCategories });
    assert.equal(hiddenRes2.state, 'hidden');
    assert.equal(hiddenRes2.category?.id, 'cat-hidden');

    // Unavailable state (not found anywhere)
    const unavailRes = resolveCategorySelection({ categories, memberships, products, slug: 'does-not-exist' });
    assert.equal(unavailRes.state, 'unavailable');
    assert.equal(unavailRes.category, null);
});

test('Shop component source contract fulfills all wiring and decoupled requirements', () => {
    const shopSource = fs.readFileSync(new URL('../src/pages/Shop.jsx', import.meta.url), 'utf8');

    // Independently fetched categories directory never gates catalog readiness
    assert.ok(shopSource.includes('shopCategoriesService.list'), 'Must call shopCategoriesService.list');
    assert.ok(shopSource.includes('subscribeShopUpdates'), 'Must subscribe to shop updates');
    assert.ok(shopSource.includes('resolveCategorySelection'), 'Must use category selection resolution');

    // Distinct honest states
    assert.ok(shopSource.includes('Collection hidden.'), 'Must render distinct hidden collection state');
    assert.ok(shopSource.includes('Collection unavailable.'), 'Must render distinct unavailable collection state');
    assert.ok(shopSource.includes('No pairs currently listed.'), 'Must render distinct empty collection state');

    // Catalog cards unchanged
    assert.ok(shopSource.includes('CatalogCard'), 'Must render catalog products with CatalogCard');

    // Query parameter navigation
    assert.ok(shopSource.includes("searchParams.get('group')"), 'Must use group query param');
});

test('resolveCollectionArtwork prioritizes custom uploaded images over hardcoded defaults', () => {
    // 1. Custom base64 image on New Balance takes priority over default asset
    const customBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const nbWithCustomImage = {
        name: 'New Balance',
        slug: 'new-balance',
        image_url: customBase64,
    };
    assert.equal(resolveCollectionArtwork(nbWithCustomImage), customBase64);

    // 2. Custom external link on New Balance takes priority
    const nbWithLink = {
        name: 'New Balance',
        slug: 'new-balance',
        image_url: 'https://example.com/custom-nb.png',
    };
    assert.equal(resolveCollectionArtwork(nbWithLink), 'https://example.com/custom-nb.png');

    // 3. artwork_url property fallback takes priority
    const nbWithArtworkUrl = {
        name: 'New Balance',
        slug: 'new-balance',
        artwork_url: 'https://example.com/custom-artwork.png',
    };
    assert.equal(resolveCollectionArtwork(nbWithArtworkUrl), 'https://example.com/custom-artwork.png');

    // 4. Empty/null image_url falls back to default artwork for New Balance
    const nbWithoutImage = {
        name: 'New Balance',
        slug: 'new-balance',
        image_url: null,
    };
    assert.equal(resolveCollectionArtwork(nbWithoutImage), DEFAULT_COLLECTION_ARTWORK['new-balance']);

    // 5. Category without custom image and without default mapping returns null
    const otherWithoutImage = {
        name: 'Custom Brand',
        slug: 'custom-brand',
        image_url: null,
    };
    assert.equal(resolveCollectionArtwork(otherWithoutImage), null);
    assert.equal(resolveCollectionArtwork(null), null);

    // 6. Pinterest pin webpage URL falls back to default collection artwork instead of disappearing
    const nbWithPinterestPinUrl = {
        name: 'New Balance',
        slug: 'new-balance',
        image_url: 'https://in.pinterest.com/pin/123456789/',
    };
    assert.equal(resolveCollectionArtwork(nbWithPinterestPinUrl), DEFAULT_COLLECTION_ARTWORK['new-balance']);
});
