import { useEffect, useRef, useState } from 'react';
import { catalogService } from '../services/catalog.js';
import { addPair, CART_KEY, emptyCart, parseCart } from './cart.js';
import { CommerceContext } from './context.js';
import { subscribeShopUpdates } from './shopCategories.js';
import './commerce.css';

function readStoredCart() {
    try { return { cart: parseCart(window.localStorage.getItem(CART_KEY)), warning: '' }; }
    catch { return { cart: emptyCart(), warning: 'Bag storage is unavailable. Changes will last only for this visit.' }; }
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
            if (event.key !== CART_KEY && event.key !== null) return;
            try { if (event.storageArea !== window.localStorage) return; } catch { return; }
            const next = parseCart(event.key === null ? null : event.newValue);
            cartRef.current = next;
            setCart(next);
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    // Persist from user actions, not render/updater functions or storage-event echoes.
    const commit = next => {
        cartRef.current = next;
        setCart(next);
        try {
            window.localStorage.setItem(CART_KEY, JSON.stringify(next));
            setStorageWarning('');
        } catch { setStorageWarning('Bag storage is unavailable. Changes will last only for this visit.'); }
    };
    const add = id => {
        if (catalog.status !== 'ready') return;
        const product = catalog.products.find(item => item.id === id);
        commit(addPair(cartRef.current, product, catalog.source));
    };
    const addItem = item => {
        if (!item) return;
        const id = typeof item === 'object' ? item.id : item;
        add(id);
    };
    const remove = id => commit({ ...cartRef.current, ids: cartRef.current.ids.filter(item => item !== id) });
    const clear = () => commit(emptyCart());
    const retry = () => {
        setCatalog({ status: 'loading', source: null, products: [] });
        setRevision(value => value + 1);
    };

    return <CommerceContext.Provider value={{ catalog, cart, add, addItem, remove, clear, storageWarning, retry }}>{children}</CommerceContext.Provider>;
}
