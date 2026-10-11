import React, { useEffect, useRef, useState } from 'react';
import { WishlistContext } from './wishlistContext.js';
import {
    WISHLIST_KEY,
    emptyWishlist,
    parseWishlist,
    addWishlistItem,
    removeWishlistItem,
    toggleWishlistItem,
} from './wishlist.js';

function readStoredWishlist() {
    try {
        return parseWishlist(window.localStorage.getItem(WISHLIST_KEY));
    } catch {
        return emptyWishlist();
    }
}

export function WishlistProvider({ children }) {
    const [wishlist, setWishlist] = useState(readStoredWishlist);
    const wishlistRef = useRef(wishlist);

    useEffect(() => {
        const sync = (event) => {
            if (event.key !== WISHLIST_KEY && event.key !== null) return;
            try {
                if (event.storageArea !== window.localStorage) return;
            } catch {
                return;
            }
            const next = parseWishlist(event.key === null ? null : event.newValue);
            wishlistRef.current = next;
            setWishlist(next);
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, []);

    const commit = (next) => {
        wishlistRef.current = next;
        setWishlist(next);
        try {
            window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
        } catch {
            // Storage access blocked or denied
        }
    };

    const isInWishlist = (id) => {
        return wishlist.ids.includes(id);
    };

    const addToWishlist = (id) => {
        commit(addWishlistItem(wishlistRef.current, id));
    };

    const removeFromWishlist = (id) => {
        commit(removeWishlistItem(wishlistRef.current, id));
    };

    const toggleWishlist = (id) => {
        commit(toggleWishlistItem(wishlistRef.current, id));
    };

    const clearWishlist = () => {
        commit(emptyWishlist());
    };

    return (
        <WishlistContext.Provider
            value={{
                wishlist,
                wishlistCount: wishlist.ids.length,
                isInWishlist,
                addToWishlist,
                removeFromWishlist,
                toggleWishlist,
                clearWishlist,
            }}
        >
            {children}
        </WishlistContext.Provider>
    );
}

export default WishlistProvider;
