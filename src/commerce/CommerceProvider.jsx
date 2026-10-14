import { useEffect, useRef, useState } from 'react';
import { catalogService } from '../services/catalog.js';
import { CART_KEY, emptyCart, parseCart } from './cart.js';
import { CommerceContext } from './context.js';
import { subscribeShopUpdates } from './shopCategories.js';
import { shoesData } from '../data/shoes.js';
import { parsePrice } from './catalog.js';
import './commerce.css';

const QUANTITIES_KEY = 'solethief.cart.quantities.v1';
const ITEMS_KEY = 'solethief.cart.items.v1';

function readStoredCart() {
    try {
        const cart = parseCart(window.localStorage.getItem(CART_KEY));
        let quantities = {};
        try {
            const rawQ = window.localStorage.getItem(QUANTITIES_KEY);
            if (rawQ) quantities = JSON.parse(rawQ) || {};
        } catch {}
        let items = [];
        try {
            const rawI = window.localStorage.getItem(ITEMS_KEY);
            if (rawI) {
                const parsed = JSON.parse(rawI);
                if (Array.isArray(parsed)) {
                    items = parsed.filter(i => i && (cart.ids.includes(i.id) || cart.ids.includes(Number(i.id))));
                }
            }
        } catch {}

        if (items.length === 0 && cart.ids.length > 0) {
            items = cart.ids.map(id => ({
                lineId: String(id),
                id,
                size: null,
                quantity: (quantities && Number.isInteger(quantities[id]) && quantities[id] > 0)
                    ? quantities[id]
                    : (quantities && Number.isInteger(quantities[String(id)]) && quantities[String(id)] > 0)
                        ? quantities[String(id)]
                        : 1,
            }));
        }

        const ids = [...new Set([...cart.ids, ...items.map(i => i.id)])];
        return { cart: { ...cart, ids, quantities, items }, warning: '' };
    }
    catch { return { cart: { ...emptyCart(), quantities: {}, items: [] }, warning: 'Bag storage is unavailable. Changes will last only for this visit.' }; }
}

export default function CommerceProvider({ children }) {
    const [initial] = useState(readStoredCart);
    const [cart, setCart] = useState(initial.cart);
    const cartRef = useRef(initial.cart);
    const [storageWarning, setStorageWarning] = useState(initial.warning);
    const [catalog, setCatalog] = useState({ status: 'loading', source: null, products: [] });
    const [revision, setRevision] = useState(0);

    useEffect(() => subscribeShopUpdates(() => setRevision(value => value + 1)), []);

    useEffect(() => {
        let active = true;
        catalogService.list({ allowPreview: true }).then(result => {
            if (active) setCatalog({ ...result, status: 'ready' });
        }).catch(() => {
            if (active) setCatalog({ status: 'error', source: null, products: [], message: 'The catalog could not be loaded. Check your connection or configuration and try again. No preview has replaced this error.' });
        });
        return () => { active = false; };
    }, [revision]);

    useEffect(() => {
        const sync = event => {
            if (event.key !== CART_KEY && event.key !== QUANTITIES_KEY && event.key !== ITEMS_KEY && event.key !== null) return;
            try { if (event.storageArea !== window.localStorage) return; } catch { return; }
            const stored = readStoredCart();
            cartRef.current = stored.cart;
            setCart(stored.cart);
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    // Persist from user actions, not render/updater functions or storage-event echoes.
    const commit = next => {
        cartRef.current = next;
        setCart(next);
        try {
            const baseCart = { version: 1, source: next.source, ids: next.ids };
            window.localStorage.setItem(CART_KEY, JSON.stringify(baseCart));
            if (next.items && next.items.length > 0) {
                window.localStorage.setItem(ITEMS_KEY, JSON.stringify(next.items));
            } else {
                window.localStorage.removeItem(ITEMS_KEY);
            }
            if (next.quantities && Object.keys(next.quantities).length > 0) {
                window.localStorage.setItem(QUANTITIES_KEY, JSON.stringify(next.quantities));
            } else {
                window.localStorage.removeItem(QUANTITIES_KEY);
            }
            setStorageWarning('');
        } catch { setStorageWarning('Bag storage is unavailable. Changes will last only for this visit.'); }
    };
    const add = (id, quantity = 1, size = null) => {
        const numericId = Number(id);
        const targetId = Number.isInteger(numericId) && numericId > 0 ? numericId : id;
        let product = catalog.products?.find(item => item.id === targetId || String(item.id) === String(id));
        if (!product) {
            const seed = shoesData.find(s => s.id === targetId || String(s.id) === String(id));
            if (seed) {
                const parsedPrice = parsePrice(String(seed.price || '').replace(/[^\d.]/g, ''));
                product = {
                    ...seed,
                    id: targetId,
                    priceMinor: Number.isSafeInteger(parsedPrice) ? parsedPrice : 1800000,
                    currency: 'INR',
                };
            }
        }
        const source = catalog.source || 'preview';
        const chosenSize = size || product?.size || 'US 9';
        const lineId = `${targetId}:${chosenSize}`;
        const qtyNum = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

        let currentItems = Array.isArray(cartRef.current.items) ? [...cartRef.current.items] : [];
        if (currentItems.length === 0 && (cartRef.current.ids || []).length > 0) {
            currentItems = cartRef.current.ids.map(cid => ({
                lineId: String(cid),
                id: cid,
                size: null,
                quantity: cartRef.current.quantities?.[cid] || 1,
            }));
        }

        const existingIndex = currentItems.findIndex(i =>
            i.lineId === lineId || (i.id === targetId && i.size === chosenSize)
        );

        let nextItems;
        if (existingIndex >= 0) {
            nextItems = currentItems.map((item, idx) => {
                if (idx === existingIndex) {
                    return { ...item, quantity: (item.quantity || 1) + qtyNum };
                }
                return item;
            });
        } else {
            nextItems = [...currentItems, { lineId, id: targetId, size: chosenSize, quantity: qtyNum }];
        }

        const nextIds = [...new Set(nextItems.map(i => i.id))];
        const nextQuantities = { ...(cartRef.current.quantities || {}) };
        nextQuantities[lineId] = nextItems.find(i => i.lineId === lineId)?.quantity || qtyNum;
        nextQuantities[targetId] = nextItems.filter(i => i.id === targetId).reduce((s, i) => s + (i.quantity || 1), 0);

        commit({
            version: 1,
            source: cartRef.current.source || source,
            ids: nextIds,
            items: nextItems,
            quantities: nextQuantities,
        });
    };
    const updateQuantity = (lineIdOrId, quantity) => {
        const qtyNum = Math.max(1, Math.floor(Number(quantity) || 1));
        const currentItems = Array.isArray(cartRef.current.items) ? [...cartRef.current.items] : [];
        let nextItems;
        if (currentItems.length > 0) {
            nextItems = currentItems.map(item => {
                if (item.lineId === String(lineIdOrId) || item.id === lineIdOrId || item.lineId === lineIdOrId) {
                    return { ...item, quantity: qtyNum };
                }
                return item;
            });
        } else {
            nextItems = (cartRef.current.ids || []).map(cid => ({
                lineId: String(cid),
                id: cid,
                size: null,
                quantity: cid === lineIdOrId ? qtyNum : (cartRef.current.quantities?.[cid] || 1),
            }));
        }
        const nextQuantities = { ...(cartRef.current.quantities || {}) };
        nextQuantities[lineIdOrId] = qtyNum;
        nextQuantities[String(lineIdOrId)] = qtyNum;
        commit({ ...cartRef.current, items: nextItems, quantities: nextQuantities });
    };
    const addItem = (item, quantity = 1, size = null) => {
        if (!item) return;
        const id = typeof item === 'object' ? item.id : item;
        const chosenSize = size || (typeof item === 'object' ? item.size : null);
        add(id, quantity, chosenSize);
    };
    const remove = lineIdOrId => {
        const currentItems = Array.isArray(cartRef.current.items) ? [...cartRef.current.items] : [];
        let nextItems;
        let nextIds;
        if (currentItems.length > 0) {
            nextItems = currentItems.filter(item =>
                item.lineId !== String(lineIdOrId) && item.lineId !== lineIdOrId && item.id !== lineIdOrId
            );
            nextIds = [...new Set(nextItems.map(item => item.id))];
        } else {
            nextItems = [];
            nextIds = (cartRef.current.ids || []).filter(item => item !== lineIdOrId);
        }
        const nextQuantities = { ...(cartRef.current.quantities || {}) };
        delete nextQuantities[lineIdOrId];
        delete nextQuantities[String(lineIdOrId)];
        commit({ ...cartRef.current, ids: nextIds, items: nextItems, quantities: nextQuantities });
    };
    const clear = () => {
        try {
            window.localStorage.removeItem(QUANTITIES_KEY);
            window.localStorage.removeItem(ITEMS_KEY);
        } catch {}
        commit({ ...emptyCart(), quantities: {}, items: [] });
    };
    const retry = () => {
        setCatalog({ status: 'loading', source: null, products: [] });
        setRevision(value => value + 1);
    };

    return <CommerceContext.Provider value={{ catalog, cart, add, addItem, remove, clear, updateQuantity, storageWarning, retry }}>{children}</CommerceContext.Provider>;
}
