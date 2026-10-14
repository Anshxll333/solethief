import { shoesData as initialShoes } from '../data/shoes.js';

const STORAGE_KEY = 'solethief.admin.home-showcase.v2';
const EVENT_NAME = 'solethief:home-showcase-updated';

export const DEFAULT_SHOWCASE_SHOES = initialShoes.map((shoe) => ({
    id: shoe.id,
    name: shoe.name,
    brand: shoe.brand,
    price: shoe.price,
    size: shoe.size || 'US 9',
    frontImage: shoe.frontImage,
    sideImage: shoe.sideImage || shoe.frontImage,
    physics: shoe.physics || { mass: 3, stiffness: 0.02, initialRotation: 0 },
    active: true,
}));

function clone(val) {
    return JSON.parse(JSON.stringify(val));
}

export function getHomeShowcaseShoes({ storage = globalThis.localStorage } = {}) {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) return clone(DEFAULT_SHOWCASE_SHOES);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
        }
    } catch (e) {
        console.warn('[homeShowcase] Failed to parse showcase shoes from storage:', e);
    }
    return clone(DEFAULT_SHOWCASE_SHOES);
}

export function saveHomeShowcaseShoes(shoes, { storage = globalThis.localStorage } = {}) {
    if (!Array.isArray(shoes)) {
        throw new Error('Showcase shoes must be an array');
    }
    storage?.setItem(STORAGE_KEY, JSON.stringify(shoes));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: shoes }));
    }
    return shoes;
}

export function addHomeShowcaseShoe(shoeData, { storage = globalThis.localStorage } = {}) {
    const list = getHomeShowcaseShoes({ storage });
    const nextId = list.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0) + 1;
    const newShoe = {
        id: nextId,
        name: shoeData?.name?.trim() || `SHOWCASE SHOE #${nextId}`,
        brand: shoeData?.brand?.trim() || 'SOLETHIEF',
        price: shoeData?.price?.trim() || '15,000.00',
        size: shoeData?.size?.trim() || 'US 9',
        frontImage: shoeData?.frontImage?.trim() || '/shoes/transparent/shoe-1-front.png',
        sideImage: shoeData?.sideImage?.trim() || shoeData?.frontImage?.trim() || '/shoes/transparent/shoe-1-side.png',
        physics: shoeData?.physics || { mass: 4, stiffness: 0.02, initialRotation: (nextId % 2 === 0 ? 15 : -15) },
        active: shoeData?.active !== false,
    };
    const updated = [...list, newShoe];
    saveHomeShowcaseShoes(updated, { storage });
    return newShoe;
}

export function updateHomeShowcaseShoe(id, patch, { storage = globalThis.localStorage } = {}) {
    const list = getHomeShowcaseShoes({ storage });
    const targetId = Number(id);
    const updated = list.map((shoe) => {
        if (Number(shoe.id) === targetId) {
            return {
                ...shoe,
                ...patch,
                id: shoe.id,
                physics: patch.physics ? { ...shoe.physics, ...patch.physics } : shoe.physics,
            };
        }
        return shoe;
    });
    saveHomeShowcaseShoes(updated, { storage });
    return updated.find((s) => Number(s.id) === targetId) || null;
}

export function deleteHomeShowcaseShoe(id, { storage = globalThis.localStorage } = {}) {
    const list = getHomeShowcaseShoes({ storage });
    const targetId = Number(id);
    const updated = list.filter((s) => Number(s.id) !== targetId);
    saveHomeShowcaseShoes(updated, { storage });
    return updated;
}

export function resetHomeShowcaseShoes({ storage = globalThis.localStorage } = {}) {
    const defaults = clone(DEFAULT_SHOWCASE_SHOES);
    saveHomeShowcaseShoes(defaults, { storage });
    return defaults;
}

export function subscribeHomeShowcase(listener) {
    if (typeof window === 'undefined') return () => { };
    const handleCustom = (e) => listener(e.detail);
    const handleStorage = (e) => {
        if (e.key === STORAGE_KEY) {
            listener(getHomeShowcaseShoes());
        }
    };
    window.addEventListener(EVENT_NAME, handleCustom);
    window.addEventListener('storage', handleStorage);
    return () => {
        window.removeEventListener(EVENT_NAME, handleCustom);
        window.removeEventListener('storage', handleStorage);
    };
}

export { STORAGE_KEY, EVENT_NAME };
