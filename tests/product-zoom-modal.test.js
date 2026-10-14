import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ProductDetails Zoom Modal: background matches site warm cream palette without pitch-black break', () => {
    const css = readFileSync('src/index.css', 'utf8');

    // Extract .pairZoomModal block
    const modalMatch = css.match(/\.pairZoomModal\s*\{([^}]+)\}/);
    assert.ok(modalMatch, 'Should define .pairZoomModal in src/index.css');
    const modalBody = modalMatch[1];

    // Must not contain pitch black background
    assert.doesNotMatch(modalBody, /rgba\(\s*16\s*,\s*16\s*,\s*16/, 'Must not use pitch-black rgba(16, 16, 16) background');
    assert.doesNotMatch(modalBody, /#000000|#101010|\bblack\b/, 'Must not use pure black backgrounds');

    // Must use warm cream background matching site frontend (#F1EBDD is 241, 235, 221)
    assert.match(modalBody, /rgba\(\s*241\s*,\s*235\s*,\s*221/i, 'Must use warm cream rgba(241, 235, 221, ...) background');
    assert.match(modalBody, /backdrop-filter:\s*blur\(/, 'Must have backdrop-filter blur');
});

test('ProductDetails Zoom Modal: header and controls use dark ink styling for legibility on cream background', () => {
    const css = readFileSync('src/index.css', 'utf8');

    // Header must have ink color
    const headerMatch = css.match(/\.pairZoomHeader\s*\{([^}]+)\}/);
    assert.ok(headerMatch, 'Should define .pairZoomHeader');
    assert.match(headerMatch[1], /var\(--ink\)|#1A1A1A/, 'Header text must use dark ink color');
    assert.doesNotMatch(headerMatch[1], /#F1EBDD/, 'Header must not use light cream text on light background');

    // Close button must use ink color
    const closeBtnMatch = css.match(/\.pairZoomCloseBtn\s*\{([^}]+)\}/);
    assert.ok(closeBtnMatch, 'Should define .pairZoomCloseBtn');
    assert.match(closeBtnMatch[1], /var\(--ink\)|#1A1A1A/, 'Close button must use ink color');

    // Navigation arrows must use light-bg theme with ink contrast
    const arrowMatch = css.match(/\.pairZoomArrow\s*\{([^}]+)\}/);
    assert.ok(arrowMatch, 'Should define .pairZoomArrow');
    assert.match(arrowMatch[1], /var\(--ink\)|#1A1A1A/, 'Arrow controls must have ink contrast');
    assert.doesNotMatch(arrowMatch[1], /color:\s*#FFFFFF/, 'Arrow controls must not use white text on cream bg');

    // Image shadow should be soft and natural on light background
    const imageMatch = css.match(/\.pairZoomImage\s*\{([^}]+)\}/);
    assert.ok(imageMatch, 'Should define .pairZoomImage');
    assert.doesNotMatch(imageMatch[1], /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.5\)/, 'Should not use harsh 0.5 black drop shadow');
});
