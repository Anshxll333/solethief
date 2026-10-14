import { useEffect, useState } from 'react';
import {
    getCachedCleanArtwork,
    stripWhiteFromDataUrl,
    TRANSPARENT_PIXEL,
} from '../services/transparentArtwork.js';

/**
 * Renders an image with automatic background removal and edge blending.
 * Cleans JPEG / opaque PNG backgrounds into transparent graphics
 * matching the surrounding website theme seamlessly.
 * Prevents white flash by:
 * - Sync-checking memory and sessionStorage caches on initial render
 * - Keeping opacity at 0 and using a transparent placeholder while processing
 * - Smoothly fading in transparent artwork once ready
 * - Preserving the original image if background cannot be isolated
 */
export default function TransparentArtwork(props) {
    return <ArtworkImage key={props.src} {...props} />;
}

function ArtworkImage({
    src,
    alt = '',
    className = '',
    onError,
    fallback = null,
    style,
    ...props
}) {
    const [cleanSrc, setCleanSrc] = useState(() => getCachedCleanArtwork(src));
    const [isReady, setIsReady] = useState(() => Boolean(getCachedCleanArtwork(src)));
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (!src || getCachedCleanArtwork(src)) {
            return;
        }

        let active = true;

        stripWhiteFromDataUrl(src)
            .then((result) => {
                if (active) {
                    setCleanSrc(result || src);
                    setIsReady(true);
                }
            })
            .catch(() => {
                if (active) {
                    setCleanSrc(src);
                    setIsReady(true);
                    setHasError(true);
                }
            });

        return () => {
            active = false;
        };
    }, [src]);

    const handleError = (e) => {
        if (!cleanSrc) return;
        setHasError(true);
        if (typeof onError === 'function') {
            onError(e);
        }
    };

    if (hasError) {
        return fallback;
    }

    if (!src) return null;

    // Use transparent pixel placeholder while in-flight so raw white rectangle never paints on DOM
    const displayedSrc = cleanSrc || TRANSPARENT_PIXEL;


    const combinedStyle = {
        opacity: isReady ? undefined : 0,
        mixBlendMode: 'normal',
        transition: 'opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
    };

    const stateClass = isReady ? 'transparentArtwork--ready' : 'transparentArtwork--loading';
    const combinedClassName = [className, 'transparentArtwork', stateClass].filter(Boolean).join(' ');

    return (
        <img
            src={displayedSrc}
            alt={alt}
            className={combinedClassName}
            style={combinedStyle}
            onError={handleError}
            {...props}
        />
    );
}
