import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isDataUrl,
    isOnlineImageUrl,
    isPinterestPageUrl,
    isWebpageUrl,
    extractPinterestImageCandidates,
    normalizeImageDataUrl,
    downloadImageAsDataUrl,
    downloadAndOptimizeRemoteImage,
    fetchAndOptimizeRemoteImage,
} from '../src/services/remoteImage.js';

test('remoteImage: isDataUrl identifies valid and invalid data URLs', () => {
    assert.equal(isDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'), true);
    assert.equal(isDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'), true);
    assert.equal(isDataUrl('data:image/webp;base64,UklGR'), true);
    assert.equal(isDataUrl('https://example.com/shoe.png'), false);
    assert.equal(isDataUrl('/shoes/shoe-1-front.png'), false);
    assert.equal(isDataUrl(''), false);
    assert.equal(isDataUrl(null), false);
});

test('remoteImage: isOnlineImageUrl detects remote HTTP and HTTPS links', () => {
    assert.equal(isOnlineImageUrl('https://images.unsplash.com/photo-1542291026-7eec264c27ff'), true);
    assert.equal(isOnlineImageUrl('http://example.com/shoe.png'), true);
    assert.equal(isOnlineImageUrl('https://i.pinimg.com/originals/ab/cd/ef/sample.jpg'), true);
    assert.equal(isOnlineImageUrl('https://example.com/sneaker.webp?w=1200'), true);

    // Negative cases
    assert.equal(isOnlineImageUrl('/shoes/transparent/shoe-1-front.png'), false);
    assert.equal(isOnlineImageUrl('shoe-1-front.png'), false);
    assert.equal(isOnlineImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'), false);
    assert.equal(isOnlineImageUrl(''), false);
    assert.equal(isOnlineImageUrl('   '), false);
    assert.equal(isOnlineImageUrl(null), false);
    assert.equal(isOnlineImageUrl(undefined), false);
});

test('remoteImage: isPinterestPageUrl accurately identifies Pinterest pins and boards', () => {
    assert.equal(isPinterestPageUrl('https://in.pinterest.com/pin/1120481582294150365/'), true);
    assert.equal(isPinterestPageUrl('https://www.pinterest.com/pin/123456789/'), true);
    assert.equal(isPinterestPageUrl('https://pin.it/7xK9LmP'), true);
    assert.equal(isPinterestPageUrl('https://i.pinimg.com/originals/ab/cd/ef/abcdef.jpg'), false);
    assert.equal(isPinterestPageUrl('https://example.com/shoes/pin/123'), false);
});

test('remoteImage: isWebpageUrl identifies html pages versus direct image urls', () => {
    assert.equal(isWebpageUrl('https://pinterest.com/pin/123'), true);
    assert.equal(isWebpageUrl('https://instagram.com/p/abcde'), true);
    assert.equal(isWebpageUrl('https://example.com/page.html'), true);
    assert.equal(isWebpageUrl('https://example.com/image.jpg'), false);
    assert.equal(isWebpageUrl('https://i.pinimg.com/736x/12/34/56/image.png'), false);
    assert.equal(isWebpageUrl('/shoes/transparent/shoe-1-front.png'), false);
});

test('remoteImage: extractPinterestImageCandidates finds and promotes high-res images', () => {
    const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta property="og:image" content="https://i.pinimg.com/736x/77/88/99/sample736.jpg" />
        </head>
        <body>
            <script type="application/ld+json">
            {
                "@type": "ImageObject",
                "contentUrl": "https://i.pinimg.com/564x/11/22/33/sample564.jpg"
            }
            </script>
        </body>
        </html>
    `;

    const candidates = extractPinterestImageCandidates(sampleHtml);
    assert.ok(candidates.length > 0);
    // Should have promoted original version
    assert.ok(candidates.some(c => c.includes('/originals/77/88/99/sample736.jpg')));
    assert.ok(candidates.some(c => c.includes('/originals/11/22/33/sample564.jpg')));
});

test('remoteImage: normalizeImageDataUrl validates data URLs and enforces size limits', () => {
    const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    assert.equal(normalizeImageDataUrl(validDataUrl), validDataUrl);

    // Rejects non-data URL
    assert.throws(() => normalizeImageDataUrl('https://example.com/pic.jpg'), /Invalid image format/);

    // Rejects unsupported mime type
    assert.throws(() => normalizeImageDataUrl('data:text/plain;base64,SGVsbG8='), /Unsupported image type/);

    // Rejects oversized payload
    const oversized = 'data:image/png;base64,' + 'A'.repeat(11 * 1024 * 1024);
    assert.throws(() => normalizeImageDataUrl(oversized), /exceeds maximum allowed length/);
});

test('remoteImage: downloadImageAsDataUrl returns immediately when passed an existing data URL', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    let statusCalled = false;
    const res = await downloadImageAsDataUrl(sampleDataUrl, {
        onStatus: () => { statusCalled = true; },
    });

    assert.equal(res.dataUrl, sampleDataUrl);
    assert.equal(statusCalled, false);
});

test('remoteImage: downloadAndOptimizeRemoteImage passes through data URL with optional custom compression', async () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    let compressCalled = false;

    const result = await downloadAndOptimizeRemoteImage(sampleDataUrl, {
        compressFn: async (dataUri) => {
            compressCalled = true;
            return dataUri;
        },
    });

    assert.equal(result, sampleDataUrl);
    assert.equal(compressCalled, true);
});

test('remoteImage: downloadAndOptimizeRemoteImage handles alias and invalid URL gracefully', async () => {
    assert.equal(downloadAndOptimizeRemoteImage, fetchAndOptimizeRemoteImage);

    // Empty URL rejection
    await assert.rejects(
        async () => {
            await downloadAndOptimizeRemoteImage('');
        },
        /Image URL is required/
    );

    await assert.rejects(
        async () => {
            await downloadAndOptimizeRemoteImage(null);
        },
        /Image URL is required/
    );
});

test('remoteImage: downloadAndOptimizeRemoteImage downloads mock remote image and compresses it', async () => {
    const originalFetch = globalThis.fetch;
    const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const tinyPngBuffer = Buffer.from(tinyPngBase64, 'base64');

    globalThis.fetch = async (url) => {
        if (typeof url === 'string' && url.includes('/api/proxy-image')) {
            return {
                ok: false,
                status: 404,
                json: async () => ({ success: false }),
            };
        }
        return {
            ok: true,
            status: 200,
            headers: {
                get: (header) => (header.toLowerCase() === 'content-type' ? 'image/png' : null),
            },
            blob: async () => ({
                size: tinyPngBuffer.length,
                type: 'image/png',
                arrayBuffer: async () => tinyPngBuffer.buffer.slice(tinyPngBuffer.byteOffset, tinyPngBuffer.byteOffset + tinyPngBuffer.byteLength),
            }),
            arrayBuffer: async () => tinyPngBuffer.buffer.slice(tinyPngBuffer.byteOffset, tinyPngBuffer.byteOffset + tinyPngBuffer.byteLength),
            json: async () => ({}),
        };
    };

    try {
        const statuses = [];
        const result = await downloadAndOptimizeRemoteImage('https://example.com/test-shoe.png', {
            onStatus: (msg) => statuses.push(msg),
            compressFn: async (dataUri) => {
                // simulated compression
                return dataUri.replace('image/png', 'image/webp');
            },
        });

        assert.ok(result.startsWith('data:image/webp;base64,'));
        assert.ok(statuses.length > 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
