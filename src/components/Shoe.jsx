import React, { forwardRef } from 'react';
import { normalizeShoeAssetPath } from '../services/transparentArtwork.js';

const Shoe = forwardRef(({ shoe, index, className = '', style, ...props }, ref) => {
    if (!shoe) return null;

    const imageSrc = normalizeShoeAssetPath(shoe.frontImage);

    return (
        <img
            ref={ref}
            src={imageSrc}
            alt={shoe.name || `SoleThief Archival Shoe ${index + 1}`}
            className={`floatingShoe shoe${shoe.id} shoe${(index % 4) + 1} ${className}`}
            loading="eager"
            decoding="async"
            draggable={false}
            style={style}
            {...props}
        />
    );
});

Shoe.displayName = 'Shoe';

export default Shoe;
