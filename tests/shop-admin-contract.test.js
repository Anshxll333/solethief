import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ALLOWED_AUTH_RETURN_PATHS,
    isAllowedAuthReturnPath,
    sanitizeAuthReturnPath,
} from '../src/auth/authConstants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('authConstants allowlist protects redirects and permits /admin', () => {
    assert.ok(ALLOWED_AUTH_RETURN_PATHS.includes('/admin'));
    assert.ok(ALLOWED_AUTH_RETURN_PATHS.includes('/account'));
    assert.ok(ALLOWED_AUTH_RETURN_PATHS.includes('/shop'));
    assert.ok(ALLOWED_AUTH_RETURN_PATHS.includes('/checkout'));
    assert.ok(ALLOWED_AUTH_RETURN_PATHS.includes('/cart'));

    // Valid paths
    assert.equal(isAllowedAuthReturnPath('/admin'), true);
    assert.equal(isAllowedAuthReturnPath('/admin?tab=collections'), true);
    assert.equal(isAllowedAuthReturnPath('/checkout'), true);
    assert.equal(isAllowedAuthReturnPath('/account'), true);

    // Invalid / malicious paths
    assert.equal(isAllowedAuthReturnPath('https://malicious.com'), false);
    assert.equal(isAllowedAuthReturnPath('//malicious.com'), false);
    assert.equal(isAllowedAuthReturnPath('javascript:alert(1)'), false);
    assert.equal(isAllowedAuthReturnPath('/malicious-route'), false);
    assert.equal(isAllowedAuthReturnPath(null), false);
    assert.equal(isAllowedAuthReturnPath(''), false);

    // Sanitize helper
    assert.equal(sanitizeAuthReturnPath('/admin', '/account'), '/admin');
    assert.equal(sanitizeAuthReturnPath('/admin?ref=test', '/account'), '/admin?ref=test');
    assert.equal(sanitizeAuthReturnPath('https://evil.com', '/account'), '/account');
    assert.equal(sanitizeAuthReturnPath('/unknown-path', '/account'), '/account');
});

test('Admin.jsx adheres to UI source contracts for security and collections wiring', () => {
    const adminSource = fs.readFileSync(path.join(rootDir, 'src/pages/Admin.jsx'), 'utf-8');

    // 1. Keyed identity remount to clear state and prevent stale grants on auth change
    assert.ok(
        adminSource.includes("key={user?.id || 'anonymous'}") ||
        adminSource.includes('key={user?.id'),
        'Admin must remount keyed on user identity'
    );

    // 2. Default tab is collections
    assert.ok(
        adminSource.includes("useState('collections')"),
        "Admin default tab must be 'collections'"
    );

    // 3. Mounts ShopCollectionsAdmin component
    assert.ok(
        adminSource.includes('<ShopCollectionsAdmin'),
        'Admin must mount ShopCollectionsAdmin component'
    );

    // 4. Passes onOpenCreateDrop to ShopCollectionsAdmin
    assert.ok(
        adminSource.includes('onOpenCreateDrop={openAddDropModal}'),
        'Admin must pass onOpenCreateDrop={openAddDropModal} to ShopCollectionsAdmin'
    );

    // 5. Connects product list refresh after drop creation
    assert.ok(
        adminSource.includes('setProductRefreshTrigger') ||
        adminSource.includes('productRefreshTrigger'),
        'Admin must refresh product list on drop creation'
    );

    // 6. Local operator toggles must not bypass configured-email authorization
    assert.ok(
        !adminSource.includes('handleToggleOperatorPreview') &&
        !adminSource.includes('Enable Demo Operator Mode'),
        'Admin must not expose a preview operator authorization bypass'
    );

    // 7. Restricted fallback returns visitors to public routes
    assert.ok(
        adminSource.includes('Return Home') && adminSource.includes('Return to Public Shop'),
        'Restricted admin fallback must return visitors to public routes'
    );
});

test('ShopCollectionsAdmin.jsx adheres to UI source contracts for taxonomy and product assignment', () => {
    const collectionsSource = fs.readFileSync(
        path.join(rootDir, 'src/pages/ShopCollectionsAdmin.jsx'),
        'utf-8'
    );

    // 1. Independent directory fetching with admin flag
    assert.ok(
        collectionsSource.includes('shopCategoriesService.list({ admin: true })'),
        'Must fetch categories directory with { admin: true }'
    );

    // 2. Subscribes to shop updates
    assert.ok(
        collectionsSource.includes('subscribeShopUpdates'),
        'Must subscribe to shop update notifications'
    );

    // 3. Category CRUD: save and remove with confirm
    assert.ok(
        collectionsSource.includes('shopCategoriesService.save('),
        'Must support saving category'
    );
    assert.ok(
        collectionsSource.includes('shopCategoriesService.remove('),
        'Must support removing category'
    );
    assert.ok(
        collectionsSource.includes('window.confirm') ||
        collectionsSource.includes('confirm('),
        'Must confirm before deleting category'
    );

    // 4. Order, visibility, and artwork controls
    assert.ok(
        collectionsSource.includes('display_order'),
        'Must support display order field'
    );
    assert.ok(
        collectionsSource.includes('is_visible'),
        'Must support is_visible toggle'
    );
    assert.ok(
        collectionsSource.includes('image_url'),
        'Must support image_url field'
    );

    // 5. Searchable product picker & assignment toggle without deleting products
    assert.ok(
        collectionsSource.includes('shopCategoriesService.assign('),
        'Must support product assignment via assign()'
    );
    assert.ok(
        collectionsSource.includes('productSearchQuery'),
        'Must provide product search query filtering'
    );
    assert.ok(
        !collectionsSource.includes('deleteProduct') &&
        !collectionsSource.includes('removeProduct'),
        'Must not delete products in category manager'
    );

    // 6. Separate loading and error states for categories vs products
    assert.ok(
        collectionsSource.includes('categoriesLoading') &&
        collectionsSource.includes('productsLoading'),
        'Must have separate categoriesLoading and productsLoading states'
    );
    assert.ok(
        collectionsSource.includes('categoriesError') &&
        collectionsSource.includes('productsError'),
        'Must have separate categoriesError and productsError states'
    );

    // 7. Calls onOpenCreateDrop
    assert.ok(
        collectionsSource.includes('onOpenCreateDrop'),
        'Must support onOpenCreateDrop action button'
    );

    // 8. Guidance note for webpage / Pinterest URLs
    assert.ok(
        collectionsSource.includes('detectWebpageUrlGuidance') ||
        collectionsSource.includes('urlGuidanceNote'),
        'Must detect webpage URLs and display guidance'
    );
});

test('Shop.jsx adheres to UI source contracts for independent taxonomy and honest states', () => {
    const shopSource = fs.readFileSync(path.join(rootDir, 'src/pages/Shop.jsx'), 'utf-8');

    // 1. Independently fetched categories directory
    assert.ok(
        shopSource.includes('shopCategoriesService.list('),
        'Shop must fetch categories independently'
    );

    // 2. Stable group query parameter
    assert.ok(
        shopSource.includes("searchParams.get('group')"),
        'Shop must inspect group query parameter'
    );

    // 3. Subscribes to shop updates
    assert.ok(
        shopSource.includes('subscribeShopUpdates'),
        'Shop must subscribe to shop updates'
    );

    // 4. Distinct honest states
    assert.ok(
        shopSource.includes('resolveCategorySelection'),
        'Shop must resolve selection state via resolveCategorySelection'
    );
    assert.ok(shopSource.includes("'hidden'"), "Must support 'hidden' state");
    assert.ok(shopSource.includes("'unavailable'"), "Must support 'unavailable' state");
    assert.ok(shopSource.includes("'empty'"), "Must support 'empty' state");
    assert.ok(shopSource.includes('shopCategories'), "Must render category directory view");

    // 5. Preserves CatalogCard component
    assert.ok(
        shopSource.includes('<CatalogCard'),
        'Shop must use CatalogCard component'
    );

    // 6. Graceful artwork error handling
    assert.ok(
        shopSource.includes('onError') ||
        shopSource.includes('handleArtworkError'),
        'Shop must handle artwork loading error'
    );
});

test('Account.jsx inspects return query param and sanitizes redirection', () => {
    const accountSource = fs.readFileSync(path.join(rootDir, 'src/pages/Account.jsx'), 'utf-8');

    assert.ok(
        accountSource.includes("searchParams.get('return')") ||
        accountSource.includes('sanitizeAuthReturnPath'),
        'Account must inspect and sanitize return query parameter'
    );
});
