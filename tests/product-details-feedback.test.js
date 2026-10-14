import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ProductDetails: feedback row only renders on active justAdded, not across page refresh', () => {
    const jsx = readFileSync('src/components/ProductDetails.jsx', 'utf8');

    // Feedback row must only show when justAdded is true
    assert.match(jsx, /\{justAdded\s*&&\s*\(\s*<div\s+className="pairBagFeedbackRow"/);
    assert.doesNotMatch(jsx, /\{justAdded\s*\|\|\s*isSelectedSizeInBag\s*\}/);

    // Button should not default to 'ADD ANOTHER PAIR' when item is already in cart on page load/refresh
    assert.doesNotMatch(jsx, /ADD ANOTHER PAIR/);
    assert.match(jsx, /`ADD TO BAG \(\$\{selectedSize\}\)`/);

    // Feedback row contains proper highlight elements and dismiss button
    assert.match(jsx, /className="pairBagFeedbackCheck"/);
    assert.match(jsx, /className="pairBagFeedbackText"/);
    assert.match(jsx, /VIEW BAG →/);
    assert.match(jsx, /className="pairBagFeedbackDismiss"/);
});

test('ProductDetails: CSS includes highlighted styles and animations for bag feedback banner', () => {
    const css = readFileSync('src/index.css', 'utf8');

    assert.match(css, /\.pairBagFeedbackRow\s*\{/);
    assert.match(css, /\.pairBagFeedbackCheck\s*\{/);
    assert.match(css, /\.pairBagFeedbackText\s*\{/);
    assert.match(css, /\.pairBagFeedbackLink\s*\{/);
    assert.match(css, /\.pairBagFeedbackDismiss\s*\{/);
    assert.match(css, /pairFeedbackSlideIn/);
    assert.match(css, /\.pairAddToBagBtn\.isJustAdded\s*\{/);
});

test('ProductDetails: description accordion defaults to closed (+) and image counter 01/02 is removed', () => {
    const jsx = readFileSync('src/components/ProductDetails.jsx', 'utf8');

    // Description accordion should default to closed (false) so it shows (+) on page reload
    assert.match(jsx, /const\s+\[openDescription,\s*setOpenDescription\]\s*=\s*useState\(false\);/);
    assert.doesNotMatch(jsx, /const\s+\[openDescription,\s*setOpenDescription\]\s*=\s*useState\(true\)/);

    // 01 / 02 counter should not be present on product page
    assert.doesNotMatch(jsx, /counterText/);
    assert.doesNotMatch(jsx, /pairGalleryMetaRow/);
});

test('ProductDetails: CSS removes bottom border line directly under MATERIALS & CARE accordion', () => {
    const css = readFileSync('src/index.css', 'utf8');

    assert.match(css, /\.pairAccordion:last-child\s*\{\s*border-bottom:\s*none;\s*\}/);
});
