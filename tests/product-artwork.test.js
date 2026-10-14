import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptCatalogRow, previewDropToRow } from '../src/services/catalog.js';
import { clearCachedCleanArtwork, getCachedCleanArtwork, getArtworkStorageKey, stripWhiteFromDataUrl } from '../src/services/transparentArtwork.js';

test('uploaded and remote product sources survive catalog adaptation and enter artwork rendering', () => {
    for (const source of ['data:image/png;base64,AAAA', 'https://example.com/dior.jpg']) {
        const drop = { id: 5, name: 'AIR', brand: 'Dior', size: 'UK 8', priceMinor: 10000, currency: 'INR', active: true, frontImage: source, sideImage: source, images: [source] };
        const original = JSON.stringify(drop);
        const product = adaptCatalogRow(previewDropToRow(drop));
        assert.equal(product.frontImage, source);
        assert.deepEqual(product.images, [source]);
        assert.equal(JSON.stringify(drop), original);
    }
    const card = readFileSync(new URL('../src/components/ShoeCard.jsx', import.meta.url), 'utf8');
    assert.match(card, /<TransparentArtwork\s+src=\{frontImage\}/);
    assert.match(card, /<TransparentArtwork\s+src=\{sideImage\}/);
});

test('processing removes connected pale background but preserves enclosed white shoe details; failures retry', async () => {
    const previous = Object.fromEntries(['window', 'document', 'Image', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const pixels = new Uint8ClampedArray(9 * 9 * 4);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const inside = x >= 2 && x <= 6 && y >= 2 && y <= 6;
        const white = x >= 3 && x <= 5 && y >= 3 && y <= 5;
        const value = white ? 255 : inside ? 80 : 230;
        pixels.set([value, value, value, 255], (y * 9 + x) * 4);
    }
    let output;
    let fail = false;
    const loaded = [];
    const storage = new Map([['solethief.clean_art.data-source', 'old-result']]);
    try {
        globalThis.window = {};
        globalThis.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
        globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() { }, getImageData: () => ({ data: pixels.slice() }), putImageData: image => { output = image.data; } }), toDataURL: () => 'data:image/png;base64,processed' }) };
        globalThis.Image = class {
            naturalWidth = 9;
            naturalHeight = 9;
            set src(value) { loaded.push(value); queueMicrotask(() => fail ? this.onerror() : this.onload()); }
        };
        clearCachedCleanArtwork();
        const source = 'data:image/png;base64,AAAA';
        assert.equal(await stripWhiteFromDataUrl(source), 'data:image/png;base64,processed');
        assert.deepEqual(loaded, [source]);
        assert.equal(output[3], 0);
        assert.equal(output[(4 * 9 + 4) * 4 + 3], 255);
        assert.equal(output[(2 * 9 + 4) * 4 + 3], 255);
        assert.equal(getCachedCleanArtwork(source), 'data:image/png;base64,processed');
        assert.ok(getArtworkStorageKey(source).startsWith('solethief.clean_art.v3.'));
        assert.equal(storage.get('solethief.clean_art.data-source'), 'old-result');
        fail = true;
        const remote = 'https://example.com/cors.jpg';
        assert.equal(await stripWhiteFromDataUrl(remote), remote);
        assert.equal(getCachedCleanArtwork(remote), null);
        fail = false;
        assert.equal(await stripWhiteFromDataUrl(remote), 'data:image/png;base64,processed');
    } finally {
        clearCachedCleanArtwork();
        for (const [key, descriptor] of Object.entries(previous)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});

test('artwork renderer resets on source changes and preserves CSS hover opacity without blending', () => {
    const source = readFileSync(new URL('../src/components/TransparentArtwork.jsx', import.meta.url), 'utf8');
    assert.match(source, /key=\{props.src\}/);
    assert.match(source, /opacity: isReady \? undefined : 0/);
    assert.match(source, /mixBlendMode: 'normal'/);
});
