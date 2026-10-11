import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getArtworkStorageKey,
    getCachedCleanArtwork,
    setCachedCleanArtwork,
    clearCachedCleanArtwork,
    stripWhiteFromDataUrl,
} from '../src/services/transparentArtwork.js';

test('getArtworkStorageKey produces distinct, deterministic keys for URLs and large data URIs', () => {
    const shortUrl1 = 'https://example.com/shoes/nike-dunk.jpg';
    const shortUrl2 = 'https://example.com/shoes/adidas-samba.jpg';
    assert.equal(getArtworkStorageKey(shortUrl1), `solethief.clean_art.${shortUrl1}`);
    assert.notEqual(getArtworkStorageKey(shortUrl1), getArtworkStorageKey(shortUrl2));

    const longDataUrl1 = 'data:image/png;base64,' + 'A'.repeat(500);
    const longDataUrl2 = 'data:image/png;base64,' + 'B'.repeat(500);
    const key1 = getArtworkStorageKey(longDataUrl1);
    const key2 = getArtworkStorageKey(longDataUrl2);

    assert.ok(key1.startsWith('solethief.clean_art.'));
    assert.ok(key1.length < 50);
    assert.notEqual(key1, key2);

    // Deterministic on repeated calls
    assert.equal(getArtworkStorageKey(longDataUrl1), key1);

    // Non-strings return empty string
    assert.equal(getArtworkStorageKey(null), '');
    assert.equal(getArtworkStorageKey(123), '');
});

test('getCachedCleanArtwork immediately recognizes transparent and svg paths', () => {
    clearCachedCleanArtwork();

    const transparentPath = '/shoes/transparent/shoe-1-side.png';
    const svgData = 'data:image/svg+xml;utf8,<svg></svg>';
    const svgPath = '/icons/shoe.svg';

    assert.equal(getCachedCleanArtwork(transparentPath), transparentPath);
    assert.equal(getCachedCleanArtwork(svgData), svgData);
    assert.equal(getCachedCleanArtwork(svgPath), svgPath);

    // Uncached image returns null
    assert.equal(getCachedCleanArtwork('https://example.com/opaque.jpg'), null);
});

test('setCachedCleanArtwork and getCachedCleanArtwork manage in-memory and sessionStorage cache', () => {
    clearCachedCleanArtwork();

    const src = 'https://example.com/test-artwork.jpg';
    const cleanData = 'data:image/png;base64,transparentData...';

    assert.equal(getCachedCleanArtwork(src), null);
    setCachedCleanArtwork(src, cleanData);
    assert.equal(getCachedCleanArtwork(src), cleanData);

    // Clearing cache clears memory
    clearCachedCleanArtwork();
    assert.equal(getCachedCleanArtwork(src), null);
});

test('stripWhiteFromDataUrl returns immediately for invalid, transparent, or cached inputs', async () => {
    clearCachedCleanArtwork();

    assert.equal(await stripWhiteFromDataUrl(null), null);
    assert.equal(await stripWhiteFromDataUrl(''), '');

    const transparentPath = '/shoes/transparent/new-balance.png';
    assert.equal(await stripWhiteFromDataUrl(transparentPath), transparentPath);

    const cachedSrc = 'https://example.com/cached.jpg';
    const cachedClean = 'data:image/png;base64,cached_clean';
    setCachedCleanArtwork(cachedSrc, cachedClean);
    assert.equal(await stripWhiteFromDataUrl(cachedSrc), cachedClean);
});
