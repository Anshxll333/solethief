/**
 * Utility functions for resolving Pinterest links and external image URLs,
 * fetching image bytes without CORS breakage, and converting them to persistent Base64 Data URLs.
 */

const PINTEREST_PIN_REGEX = /(?:pinterest\.[a-z.]+\/pin\/|pin\.it\/)/i;
const PINTEREST_DOMAIN_REGEX = /pinterest\.[a-z.]+/i;
const PINIMG_REGEX = /i\.pinimg\.com/i;
const DIRECT_IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|svg|gif|avif|bmp|ico)(?:$|[?#])/i;

/**
 * Checks if a string is already a Base64 data URL
 */
export function isDataUrl(url) {
    return typeof url === 'string' && url.trim().startsWith('data:image/');
}

/**
 * Checks if a string is an online HTTP(S) image URL
 */
export function isOnlineImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed);
}

/**
 * Checks if a URL is a Pinterest pin or webpage link
 */
export function isPinterestPageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('/')) return false;
    if (PINIMG_REGEX.test(trimmed)) return false; // direct image CDN
    return PINTEREST_PIN_REGEX.test(trimmed) || PINTEREST_DOMAIN_REGEX.test(trimmed);
}

/**
 * Checks if a URL appears to be an HTML webpage rather than a direct image file
 */
export function isWebpageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('data:') || trimmed.startsWith('/')) return false;
    if (isPinterestPageUrl(trimmed)) return true;
    if (/instagram\.com\/(p|reel|tv)\//i.test(trimmed)) return true;
    if (!DIRECT_IMAGE_EXT_REGEX.test(trimmed) && !PINIMG_REGEX.test(trimmed) && !/images\.unsplash\.com/i.test(trimmed)) {
        return true;
    }
    return false;
}

/**
 * Extracts high-resolution image candidates from Pinterest page HTML
 */
export function extractPinterestImageCandidates(html) {
    if (!html || typeof html !== 'string') return [];
    const candidates = [];

    // 1. Check og:image meta tag
    const ogMatch = html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
        html.match(/<meta\s+[^>]*name=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
        candidates.push(ogMatch[1].trim());
    }

    // 2. Check JSON-LD structured data
    const jsonLdMatches = html.matchAll(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
        try {
            const data = JSON.parse(match[1]);
            const img = data.image || data.contentUrl || (Array.isArray(data['@graph']) && data['@graph'].find(g => g.image || g.contentUrl)?.image);
            if (typeof img === 'string') {
                candidates.push(img.trim());
            } else if (Array.isArray(img) && typeof img[0] === 'string') {
                candidates.push(img[0].trim());
            }
        } catch {
            // Ignore malformed JSON-LD
        }
    }

    // 3. Check for i.pinimg.com URLs in the document
    const pinImgMatches = html.matchAll(/https:\/\/i\.pinimg\.com\/(originals|[0-9]+x)\/[a-zA-Z0-9/._-]+\.(?:jpe?g|png|webp)/gi);
    for (const match of pinImgMatches) {
        if (match[0]) candidates.push(match[0]);
    }

    // Deduplicate while preserving order
    const unique = Array.from(new Set(candidates));

    // For any 736x / 564x / 236x URLs, promote the originals version to the top of candidates
    const prioritized = [];
    for (const u of unique) {
        if (u.includes('/736x/') || u.includes('/564x/') || u.includes('/474x/')) {
            const originalVersion = u.replace(/\/(?:736x|564x|474x|236x)\//, '/originals/');
            if (!prioritized.includes(originalVersion)) {
                prioritized.push(originalVersion);
            }
        }
        if (!prioritized.includes(u)) {
            prioritized.push(u);
        }
    }

    return prioritized;
}

/**
 * Converts a Blob to a standard Base64 data URL with Node/browser compatibility
 */
export async function blobToDataUrl(blob) {
    if (typeof FileReader !== 'undefined') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert image to Data URL.'));
            reader.readAsDataURL(blob);
        });
    }
    const buffer = await blob.arrayBuffer();
    const base64 = typeof Buffer !== 'undefined'
        ? Buffer.from(buffer).toString('base64')
        : btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const type = blob.type || 'image/jpeg';
    return `data:${type};base64,${base64}`;
}

/**
 * Loads an image URL via Image element into canvas with CORS support
 */
export function loadImageToDataUrlViaCanvas(url) {
    if (typeof window === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
        return Promise.reject(new Error('Canvas fallback unavailable in non-browser environment'));
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas 2D context unavailable');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/webp', 0.85);
                resolve(dataUrl);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Failed to load image element'));
        img.src = url;
    });
}

/**
 * Normalizes a Data URL to strictly conform to data:image/(png|jpeg|jpg|webp|gif|svg+xml|svg|avif);base64,...
 */
export function normalizeImageDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
        throw new Error('Image data is missing or empty.');
    }
    const trimmed = dataUrl.trim();
    if (!trimmed.startsWith('data:')) {
        throw new Error('Invalid image format: Must be a data URL.');
    }
    if (!trimmed.startsWith('data:image/')) {
        throw new Error('Unsupported image type: Must be an image data URL.');
    }
    if (trimmed.length > 10 * 1024 * 1024) {
        throw new Error('Image data exceeds maximum allowed length of 10MB.');
    }
    const match = trimmed.match(/^data:image\/([a-zA-Z0-9+.-]+)(?:;[a-zA-Z0-9=._-]+)*;base64,/);
    if (!match) {
        throw new Error('Invalid image data URL encoding: Must be base64 encoded.');
    }
    const type = match[1].toLowerCase();
    const validTypes = ['png', 'jpeg', 'jpg', 'webp', 'gif', 'svg+xml', 'svg', 'avif'];
    if (!validTypes.includes(type)) {
        throw new Error(`Unsupported image type: image/${type}`);
    }
    // Return clean standard data:image/<type>;base64,... without extra parameters
    return trimmed.replace(/^data:image\/[a-zA-Z0-9+.-]+(?:;[a-zA-Z0-9=._-]+)*;base64,/, `data:image/${type};base64,`);
}

/**
 * Resolves and downloads an image from a URL (Pinterest pin or direct image)
 * into a persistent Base64 Data URL.
 *
 * @param {string} inputUrl - The Pinterest pin link or image URL
 * @param {object} options
 * @param {(status: string) => void} [options.onStatus] - Status update callback
 * @returns {Promise<{ dataUrl: string, source: string, resolvedFrom?: string }>}
 */
export async function downloadImageAsDataUrl(inputUrl, { onStatus } = {}) {
    if (!inputUrl || typeof inputUrl !== 'string') {
        throw new Error('Image URL is required.');
    }

    const trimmed = inputUrl.trim();

    // 1. Already a Data URL
    if (trimmed.startsWith('data:image/')) {
        return {
            dataUrl: normalizeImageDataUrl(trimmed),
            source: 'data-url',
        };
    }

    // 2. Relative local path (e.g. /shoes/transparent/...)
    if (trimmed.startsWith('/')) {
        onStatus?.('Loading local image...');
        const res = await fetch(trimmed);
        if (!res.ok) throw new Error(`Failed to load local image (${res.status}).`);
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        return {
            dataUrl: normalizeImageDataUrl(dataUrl),
            source: 'local-path',
        };
    }

    onStatus?.('Contacting image resolver...');

    // 3. Try local Vite dev server proxy first
    try {
        const proxyEndpoint = `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
        const localRes = await fetch(proxyEndpoint);
        if (localRes.ok) {
            const data = await localRes.json();
            if (data?.success && data?.dataUrl) {
                onStatus?.('Image downloaded and converted locally.');
                return {
                    dataUrl: normalizeImageDataUrl(data.dataUrl),
                    source: 'vite-proxy',
                    resolvedFrom: data.resolvedUrl,
                };
            }
        }
    } catch {
        // Fall back to client-side resolution
    }

    // 4. Client-side fallback resolution
    const isPinPage = isPinterestPageUrl(trimmed);

    let targetImageUrl = trimmed;

    if (isPinPage) {
        onStatus?.('Resolving Pinterest pin image...');
        // Try to fetch Pinterest HTML via CORS proxies to get the high-res pin image
        let html = '';
        const corsProxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(trimmed)}`,
            `https://corsproxy.io/?${encodeURIComponent(trimmed)}`,
        ];

        for (const proxyUrl of corsProxies) {
            try {
                const pageRes = await fetch(proxyUrl);
                if (pageRes.ok) {
                    html = await pageRes.text();
                    if (html.length > 500) break;
                }
            } catch {
                // Continue to next proxy
            }
        }

        const candidates = extractPinterestImageCandidates(html);
        if (candidates.length === 0) {
            throw new Error('Could not find image on this Pinterest page. Try copying the direct image address (e.g. i.pinimg.com/...jpg) or uploading from device.');
        }

        // Test candidates (preferring originals then 736x)
        targetImageUrl = candidates[0];
    } else if (trimmed.includes('i.pinimg.com/') && (trimmed.includes('/736x/') || trimmed.includes('/564x/'))) {
        // Direct pin link with sub-original resolution: try originals first
        const origUrl = trimmed.replace(/\/(?:736x|564x)\//, '/originals/');
        targetImageUrl = origUrl;
    }

    onStatus?.('Downloading image bytes...');

    // Download image bytes using direct fetch, or image proxies if CORS blocks direct fetch
    const imageFetchUrls = [
        targetImageUrl,
        // If target was originals and fails, try 736x fallback
        ...(targetImageUrl.includes('/originals/') ? [targetImageUrl.replace('/originals/', '/736x/')] : []),
        `https://images.weserv.nl/?url=${encodeURIComponent(targetImageUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetImageUrl)}`,
    ];

    let lastError = null;
    for (const urlToFetch of imageFetchUrls) {
        try {
            const imgRes = await fetch(urlToFetch, { mode: 'cors' });
            if (imgRes.ok) {
                const blob = await imgRes.blob();
                if (blob.size > 0) {
                    const dataUrl = await blobToDataUrl(blob);
                    onStatus?.('Image converted to local Base64.');
                    return {
                        dataUrl: normalizeImageDataUrl(dataUrl),
                        source: 'client-fallback',
                        resolvedFrom: urlToFetch,
                    };
                }
            }
        } catch (err) {
            lastError = err;
        }
    }

    // Browser Image element canvas fallback if fetch was blocked by CORS
    if (typeof window !== 'undefined' && typeof Image !== 'undefined' && typeof document !== 'undefined') {
        const canvasCandidates = [
            targetImageUrl,
            `https://images.weserv.nl/?url=${encodeURIComponent(targetImageUrl)}`,
        ];
        for (const candidate of canvasCandidates) {
            try {
                const canvasData = await loadImageToDataUrlViaCanvas(candidate);
                if (canvasData) {
                    onStatus?.('Image rendered via canvas fallback.');
                    return {
                        dataUrl: normalizeImageDataUrl(canvasData),
                        source: 'canvas-fallback',
                        resolvedFrom: candidate,
                    };
                }
            } catch {
                // Continue to next candidate
            }
        }
    }

    throw new Error(lastError?.message || 'Failed to download image. The image may be protected or unreachable. You can right-click the image to copy the direct link or use "Upload from Device".');
}

export async function compressImage(source, {
    maxDimension = 1200,
    quality = 0.8,
    mimeType = 'image/webp',
} = {}) {
    if (!source) return source;

    if (typeof source === 'string') {
        if (!source.startsWith('data:')) {
            return source;
        }
        if (source.length < 25000) {
            return source;
        }
    }

    const hasDom = typeof document !== 'undefined' && typeof Image !== 'undefined';
    if (!hasDom) {
        return typeof source === 'string' ? source : '';
    }

    return new Promise((resolve) => {
        let objectUrl = null;
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const cleanup = () => {
            if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
                try {
                    URL.revokeObjectURL(objectUrl);
                } catch {
                    // ignore
                }
            }
        };

        img.onload = () => {
            try {
                let renderW = img.naturalWidth || img.width;
                let renderH = img.naturalHeight || img.height;

                if (!renderW || !renderH) {
                    cleanup();
                    resolve(typeof source === 'string' ? source : '');
                    return;
                }

                if (renderW > maxDimension || renderH > maxDimension) {
                    if (renderW > renderH) {
                        renderH = Math.round((renderH * maxDimension) / renderW);
                        renderW = maxDimension;
                    } else {
                        renderW = Math.round((renderW * maxDimension) / renderH);
                        renderH = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = renderW;
                canvas.height = renderH;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    cleanup();
                    resolve(typeof source === 'string' ? source : '');
                    return;
                }

                ctx.drawImage(img, 0, 0, renderW, renderH);

                const isJpeg = (typeof source === 'object' && source?.type === 'image/jpeg')
                    || (typeof source === 'string' && source.startsWith('data:image/jpeg'));

                let targetFormat = isJpeg ? 'image/jpeg' : mimeType;
                let result = canvas.toDataURL(targetFormat, quality);

                if (!isJpeg && targetFormat === 'image/webp' && !result.startsWith('data:image/webp')) {
                    result = canvas.toDataURL('image/jpeg', quality);
                }

                cleanup();
                resolve(result);
            } catch {
                cleanup();
                resolve(typeof source === 'string' ? source : '');
            }
        };

        img.onerror = () => {
            cleanup();
            resolve(typeof source === 'string' ? source : '');
        };

        try {
            if (typeof source === 'string') {
                img.src = source;
            } else if (source instanceof Blob || (typeof Blob !== 'undefined' && source && typeof source.slice === 'function')) {
                if (typeof URL !== 'undefined' && URL.createObjectURL) {
                    objectUrl = URL.createObjectURL(source);
                    img.src = objectUrl;
                } else if (typeof FileReader !== 'undefined') {
                    const reader = new FileReader();
                    reader.onload = () => { img.src = reader.result; };
                    reader.onerror = () => { resolve(''); };
                    reader.readAsDataURL(source);
                } else {
                    resolve('');
                }
            } else {
                resolve('');
            }
        } catch {
            cleanup();
            resolve(typeof source === 'string' ? source : '');
        }
    });
}

export async function compressImageFile(file, options = {}) {
    if (!file) return '';
    return compressImage(file, options);
}

/**
 * Downloads a remote image (handling CORS, proxies, and canvas fallback)
 * and compresses it using client-side canvas logic into an optimized Data URI.
 *
 * @param {string} inputUrl - Remote URL (http(s)://) or data URL
 * @param {object} options
 * @param {(status: string) => void} [options.onStatus] - Status update callback
 * @param {number} [options.maxDimension] - Max dimension (default 1200)
 * @param {number} [options.quality] - Compression quality (default 0.8)
 * @param {string} [options.mimeType] - Mime type (default 'image/webp')
 * @param {Function} [options.compressFn] - Optional custom compress function
 * @returns {Promise<string>} Clean optimized Data URI
 */
export async function downloadAndOptimizeRemoteImage(inputUrl, options = {}) {
    if (!inputUrl || typeof inputUrl !== 'string') {
        throw new Error('Image URL is required.');
    }

    const trimmed = inputUrl.trim();
    if (!trimmed) {
        throw new Error('Image URL cannot be empty.');
    }

    // 1. If already a data URL, optimize if compress function or DOM available
    if (isDataUrl(trimmed)) {
        if (typeof options.compressFn === 'function') {
            const compressed = await options.compressFn(trimmed);
            return normalizeImageDataUrl(compressed || trimmed);
        }
        if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
            try {
                const compressed = await compressImage(trimmed, {
                    maxDimension: options.maxDimension ?? 1200,
                    quality: options.quality ?? 0.8,
                    mimeType: options.mimeType ?? 'image/webp',
                });
                return normalizeImageDataUrl(compressed || trimmed);
            } catch {
                return normalizeImageDataUrl(trimmed);
            }
        }
        return normalizeImageDataUrl(trimmed);
    }

    // 2. Download remote image
    options.onStatus?.('Downloading image bytes...');
    const res = await downloadImageAsDataUrl(trimmed, options);
    const dataUrl = res?.dataUrl || res;

    // 3. Compress using compressFn or canvas compression
    options.onStatus?.('Optimizing image client-side...');
    let compressed = null;
    if (typeof options.compressFn === 'function') {
        compressed = await options.compressFn(dataUrl);
    } else if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
        try {
            compressed = await compressImage(dataUrl, {
                maxDimension: options.maxDimension ?? 1200,
                quality: options.quality ?? 0.8,
                mimeType: options.mimeType ?? 'image/webp',
            });
        } catch {
            compressed = null;
        }
    }

    const finalResult = compressed || dataUrl;
    return normalizeImageDataUrl(finalResult);
}

export const fetchAndOptimizeRemoteImage = downloadAndOptimizeRemoteImage;
