/**
 * Advanced background isolation, edge blending, and caching for product and collection artwork.
 * Handles:
 * - Pure white, off-white, and neutral light/grey backgrounds
 * - Connected border flood-fill to isolate sneaker and graphics without carving out inner details
 * - Boundary anti-aliasing and edge falloff for seamless blending onto warm cream (#faf7ee / #F1EBDD) paper
 * - Memory & sessionStorage caching to eliminate redundant processing and prevent flash of un-processed background
 * Safely falls back to the original source if canvas is unavailable or tainted.
 */

const artworkMemoryCache = new Map();
const artworkInFlight = new Map();
export const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Normalizes legacy or un-prefixed shoe asset paths to their transparent variants.
 */
export function normalizeShoeAssetPath(src) {
    if (typeof src !== 'string') return src;
    // Map any /shoes/shoe-N-(front|side).png to /shoes/transparent/shoe-N-(front|side).png
    const match = src.match(/(?:^|\/)(?:shoes\/)?(shoe-[1-5]-(?:front|side)\.png)$/i);
    if (match) {
        return `/shoes/transparent/${match[1]}`;
    }
    return src;
}

/**
 * Generate a deterministic storage key for URL or Base64 data URL artwork.
 */
export function getArtworkStorageKey(src) {
    if (typeof src !== 'string') return '';
    if (src.length <= 120 && !src.startsWith('data:')) {
        return `solethief.clean_art.v3.${src}`;
    }
    let h1 = 0xdeadbeef;
    let h2 = 0x41c64e6d;
    for (let i = 0; i < src.length; i++) {
        const ch = src.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    return `solethief.clean_art.v3.${hash}_${src.length}`;
}

/**
 * Retrieve cached transparent artwork synchronously from memory or sessionStorage.
 */
export function getCachedCleanArtwork(src) {
    if (!src || typeof src !== 'string') return null;
    const normalized = normalizeShoeAssetPath(src);
    // Static assets that already reside in /transparent/ or SVG are already clean
    if (normalized.includes('/transparent/') || normalized.startsWith('data:image/svg+xml') || normalized.endsWith('.svg')) {
        artworkMemoryCache.set(src, normalized);
        artworkMemoryCache.set(normalized, normalized);
        return normalized;
    }
    if (artworkMemoryCache.has(src)) {
        return artworkMemoryCache.get(src);
    }
    if (artworkMemoryCache.has(normalized)) {
        return artworkMemoryCache.get(normalized);
    }
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
        try {
            const key = getArtworkStorageKey(normalized);
            const cached = sessionStorage.getItem(key);
            if (cached) {
                artworkMemoryCache.set(src, cached);
                artworkMemoryCache.set(normalized, cached);
                return cached;
            }
        } catch {
            // sessionStorage unavailable or restricted
        }
    }
    return null;
}

/**
 * Store clean transparent artwork in memory and sessionStorage across page refreshes.
 */
export function setCachedCleanArtwork(src, cleanSrc) {
    if (!src || !cleanSrc || typeof src !== 'string') return;
    artworkMemoryCache.set(src, cleanSrc);
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined' && cleanSrc.length < 1500000) {
        try {
            const key = getArtworkStorageKey(src);
            sessionStorage.setItem(key, cleanSrc);
        } catch {
            // QuotaExceededError or security policy
        }
    }
}

/**
 * Clear cached artwork (useful for test harnesses or explicit cache invalidation).
 */
export function clearCachedCleanArtwork() {
    artworkMemoryCache.clear();
    artworkInFlight.clear();
}

export function stripWhiteFromDataUrl(src) {
    if (!src || typeof src !== 'string') {
        return Promise.resolve(src);
    }

    const normalized = normalizeShoeAssetPath(src);
    if (normalized.includes('/transparent/') || normalized.startsWith('data:image/svg+xml') || normalized.endsWith('.svg')) {
        setCachedCleanArtwork(src, normalized);
        setCachedCleanArtwork(normalized, normalized);
        return Promise.resolve(normalized);
    }

    const cached = getCachedCleanArtwork(src);
    if (cached) {
        return Promise.resolve(cached);
    }

    if (artworkInFlight.has(src)) {
        return artworkInFlight.get(src);
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.resolve(src);
    }

    const processPromise = new Promise((resolve) => {
        const finalize = (result) => {
            artworkInFlight.delete(src);
            if (result !== src) setCachedCleanArtwork(src, result);
            resolve(result);
        };

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (!w || !h) {
                    finalize(src);
                    return;
                }

                // Bound max dimension for instant UI rendering and smooth memory usage
                let renderW = w;
                let renderH = h;
                const maxDim = 900;
                if (renderW > renderH) {
                    if (renderW > maxDim) {
                        renderH = Math.round((renderH * maxDim) / renderW);
                        renderW = maxDim;
                    }
                } else {
                    if (renderH > maxDim) {
                        renderW = Math.round((renderW * maxDim) / renderH);
                        renderH = maxDim;
                    }
                }

                canvas.width = renderW;
                canvas.height = renderH;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    finalize(src);
                    return;
                }

                ctx.drawImage(img, 0, 0, renderW, renderH);
                const imgData = ctx.getImageData(0, 0, renderW, renderH);
                const data = imgData.data;
                const totalPixels = renderW * renderH;
                let modified = false;

                // 1. Sample perimeter border & corners to detect background color & variance
                const borderSamples = [];
                const sampleStep = Math.max(1, Math.floor(Math.min(renderW, renderH) / 30));

                const samplePixel = (px, py) => {
                    const idx = (py * renderW + px) * 4;
                    if (data[idx + 3] > 20) {
                        borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
                    }
                };

                // 4 corners
                samplePixel(0, 0);
                samplePixel(renderW - 1, 0);
                samplePixel(0, renderH - 1);
                samplePixel(renderW - 1, renderH - 1);

                // Perimeter edges
                for (let x = 0; x < renderW; x += sampleStep) {
                    samplePixel(x, 0);
                    samplePixel(x, renderH - 1);
                }
                for (let y = 0; y < renderH; y += sampleStep) {
                    samplePixel(0, y);
                    samplePixel(renderW - 1, y);
                }

                // Weighted Euclidean color distance
                const colorDist = (r1, g1, b1, r2, g2, b2) => {
                    const dr = r1 - r2;
                    const dg = g1 - g2;
                    const db = b1 - b2;
                    return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
                };

                if (borderSamples.length >= 4) {
                    let sumR = 0, sumG = 0, sumB = 0;
                    for (const s of borderSamples) {
                        sumR += s[0];
                        sumG += s[1];
                        sumB += s[2];
                    }
                    const bgR = sumR / borderSamples.length;
                    const bgG = sumG / borderSamples.length;
                    const bgB = sumB / borderSamples.length;

                    let variance = 0;
                    for (const s of borderSamples) {
                        const d = colorDist(s[0], s[1], s[2], bgR, bgG, bgB);
                        variance += d * d;
                    }
                    const stdDev = Math.sqrt(variance / borderSamples.length);

                    // Check if background is solid, paper-textured, light grey, or neutral
                    const isCandidateBg = stdDev < 55 || (bgR > 165 && bgG > 165 && bgB > 165);

                    if (isCandidateBg) {
                        const tolerance = Math.max(28, Math.min(62, stdDev * 2.0 + 24));
                        const visited = new Uint8Array(totalPixels);
                        const queue = new Int32Array(totalPixels);
                        let qHead = 0;
                        let qTail = 0;

                        const checkAndEnqueue = (x, y) => {
                            const pIdx = y * renderW + x;
                            if (visited[pIdx]) return;
                            const dIdx = pIdx * 4;
                            if (data[dIdx + 3] === 0) {
                                visited[pIdx] = 1;
                                return;
                            }
                            const r = data[dIdx];
                            const g = data[dIdx + 1];
                            const b = data[dIdx + 2];
                            if (colorDist(r, g, b, bgR, bgG, bgB) <= tolerance) {
                                visited[pIdx] = 1;
                                queue[qTail++] = pIdx;
                            }
                        };

                        // Enqueue perimeter border
                        for (let x = 0; x < renderW; x++) {
                            checkAndEnqueue(x, 0);
                            checkAndEnqueue(x, renderH - 1);
                        }
                        for (let y = 0; y < renderH; y++) {
                            checkAndEnqueue(0, y);
                            checkAndEnqueue(renderW - 1, y);
                        }

                        // BFS flood fill to isolate background connected to edges
                        while (qHead < qTail) {
                            const curr = queue[qHead++];
                            const cx = curr % renderW;
                            const cy = (curr / renderW) | 0;

                            const neighbors = [
                                [cx + 1, cy],
                                [cx - 1, cy],
                                [cx, cy + 1],
                                [cx, cy - 1]
                            ];

                            for (let i = 0; i < 4; i++) {
                                const nx = neighbors[i][0];
                                const ny = neighbors[i][1];
                                if (nx >= 0 && nx < renderW && ny >= 0 && ny < renderH) {
                                    checkAndEnqueue(nx, ny);
                                }
                            }
                        }

                        // Only proceed if not an entirely blank/uniform image
                        let nonBgCount = 0;
                        for (let p = 0; p < totalPixels; p++) {
                            if (!visited[p]) nonBgCount++;
                        }

                        if (nonBgCount > 0) {
                            // Make flood-filled background transparent
                            for (let p = 0; p < totalPixels; p++) {
                                if (visited[p]) {
                                    data[p * 4 + 3] = 0;
                                    modified = true;
                                }
                            }

                            // Soft feathering on boundary pixels to eliminate jagged edges
                            for (let y = 1; y < renderH - 1; y++) {
                                for (let x = 1; x < renderW - 1; x++) {
                                    const pIdx = y * renderW + x;
                                    if (!visited[pIdx] && data[pIdx * 4 + 3] > 0) {
                                        const hasNeighborBg = visited[pIdx - 1] || visited[pIdx + 1] || visited[pIdx - renderW] || visited[pIdx + renderW];
                                        if (hasNeighborBg) {
                                            const dIdx = pIdx * 4;
                                            const r = data[dIdx];
                                            const g = data[dIdx + 1];
                                            const b = data[dIdx + 2];
                                            const d = colorDist(r, g, b, bgR, bgG, bgB);
                                            if (d <= tolerance * 1.35) {
                                                const factor = Math.max(0, Math.min(1, (d - tolerance * 0.75) / (tolerance * 0.6)));
                                                data[dIdx + 3] = Math.round(data[dIdx + 3] * factor);
                                                modified = true;
                                            }
                                        }
                                    }
                                }
                            }

                            // Neutralize residual near-white fringe along the background boundary
                            for (let y = 1; y < renderH - 1; y++) {
                                for (let x = 1; x < renderW - 1; x++) {
                                    const pIdx = y * renderW + x;
                                    if (!visited[pIdx] && data[pIdx * 4 + 3] > 0) {
                                        const hasNeighborBg = visited[pIdx - 1] || visited[pIdx + 1] || visited[pIdx - renderW] || visited[pIdx + renderW];
                                        if (hasNeighborBg) {
                                            const dIdx = pIdx * 4;
                                            const r = data[dIdx];
                                            const g = data[dIdx + 1];
                                            const b = data[dIdx + 2];
                                            const minChannel = Math.min(r, g, b);
                                            const maxChannel = Math.max(r, g, b);
                                            const chroma = maxChannel - minChannel;
                                            if (minChannel >= 240 && chroma <= 18) {
                                                data[dIdx + 3] = 0;
                                                modified = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (modified) {
                    ctx.putImageData(imgData, 0, 0);
                    finalize(canvas.toDataURL('image/png'));
                } else {
                    finalize(src);
                }
            } catch {
                finalize(src);
            }
        };

        img.onerror = () => {
            finalize(src);
        };

        img.src = src;
    });

    artworkInFlight.set(src, processPromise);
    return processPromise;
}
