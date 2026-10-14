import TransparentArtwork from './TransparentArtwork';
import { normalizeShoeAssetPath } from '../services/transparentArtwork.js';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useWishlist } from '../commerce/wishlistContext.js';

export default function ShoeCard({
  id: propId,
  name: propName,
  brand: propBrand,
  size: propSize,
  price: propPrice,
  frontImage: propFrontImage,
  sideImage: propSideImage,
  product,
  onClick,
  onDetailsClick,
  onViewClick,
  onAddClick,
  showDetailsAction = false,
  showSize = true,
  className = '',
}) {
  const navigate = useNavigate();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const item = product || {};
  const id = propId || item.id;
  const name = propName || item.name;
  const brand = propBrand || item.brand;
  const size = propSize || item.size;
  const price = propPrice ?? item.price;
  const frontImage = normalizeShoeAssetPath(propFrontImage || item.frontImage);
  const sideImage = normalizeShoeAssetPath(propSideImage || item.sideImage);

  const productSizes = Array.isArray(item.sizes) ? item.sizes : [];
  const isAllSoldOut = productSizes.length > 0 && productSizes.every(s => s.sold || s.quantity <= 0);

  const inWishlist = id ? isInWishlist(id) : false;

  const handleCardClick = (event) => {
    if (onAddClick) {
      onAddClick(event);
    } else if (onDetailsClick) {
      onDetailsClick(event);
    } else if (onClick) {
      onClick(event);
    } else if (id) {
      navigate(`/product/${id}`);
    }
  };

  const handleViewPair = (event) => {
    event.stopPropagation();
    if (onViewClick) {
      onViewClick(event);
    } else if (id) {
      navigate(`/product/${id}/images`);
    }
  };

  const handleAdd = (event) => {
    event.stopPropagation();
    if (onAddClick) {
      onAddClick(event);
    } else if (onDetailsClick) {
      onDetailsClick(event);
    } else if (onClick) {
      onClick(event);
    } else if (id) {
      navigate(`/product/${id}`);
    }
  };

  return (
    <article
      className={`shoeCard ${className}`.trim()}
      onClick={handleCardClick}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      {id && (
        <button
          type="button"
          className={`shoeWishlistBtn ${inWishlist ? 'isInWishlist' : ''}`}
          aria-label={inWishlist ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
          aria-pressed={inWishlist}
          onClick={(event) => {
            event.stopPropagation();
            toggleWishlist(id);
          }}
        >
          <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      )}
      <div className={`shoeCardImageContainer ${sideImage ? 'hasSideImage' : ''}`}>
        {isAllSoldOut && (
          <span className="shoeCardOutStockBadge">OUT OF STOCK</span>
        )}
        <TransparentArtwork
          src={frontImage}
          alt={`${name} front`}
          className="shoeImage shoeImageFront"
          loading="lazy"
        />
        {sideImage && (
          <TransparentArtwork
            src={sideImage}
            alt={`${name} side`}
            className="shoeImage shoeImageSide"
            loading="lazy"
          />
        )}
      </div>
      <div className="shoeCardInfo">
        <span className="shoeBrand">{brand}</span>
        <h3 className="shoeName">{name}</h3>
        <div className={`shoeDetailsRow ${!showSize ? 'priceOnly' : ''}`}>
          {showSize && size && <span className="shoeSize">Size: {size}</span>}
          <span className="shoePrice">&#8377;{price}</span>
        </div>
        {showDetailsAction ? (
          <div className="shoeCardActions">
            <button
              type="button"
              className={`shopButton shoeAddButton ${isAllSoldOut ? 'isSoldOut' : ''}`}
              disabled={isAllSoldOut}
              aria-label={isAllSoldOut ? `${name} is out of stock` : `Add+: open details for ${name}`}
              onClick={isAllSoldOut ? (e) => e.stopPropagation() : handleAdd}
            >
              {isAllSoldOut ? 'OUT OF STOCK' : 'Add+'}
            </button>
            <button
              type="button"
              className="shopButton shoeViewButton"
              aria-label={`View ${name}`}
              onClick={handleViewPair}
            >
              VIEW PAIR
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`shopButton shoeAddButton ${isAllSoldOut ? 'isSoldOut' : ''}`}
            disabled={isAllSoldOut}
            aria-label={isAllSoldOut ? `${name} is out of stock` : `Add+: open details for ${name}`}
            onClick={isAllSoldOut ? (e) => e.stopPropagation() : handleAdd}
          >
            {isAllSoldOut ? 'OUT OF STOCK' : 'Add+'}
          </button>
        )}
      </div>
    </article>
  );
}
