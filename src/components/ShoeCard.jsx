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
  const frontImage = propFrontImage || item.frontImage;
  const sideImage = propSideImage || item.sideImage;

  const inWishlist = id ? isInWishlist(id) : false;

  const handleCardClick = (event) => {
    if (onClick) {
      onClick(event);
    } else if (onViewClick) {
      onViewClick(event);
    } else if (id) {
      navigate(`/product/${id}/images`);
    }
  };

  const handleViewPair = (event) => {
    event.stopPropagation();
    if (onViewClick) {
      onViewClick(event);
    } else if (onClick) {
      onClick(event);
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
        <img
          src={frontImage}
          alt={`${name} front`}
          className="shoeImage shoeImageFront"
          loading="lazy"
        />
        {sideImage && (
          <img
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
              className="shopButton"
              aria-label={`View ${name}`}
              onClick={handleViewPair}
            >
              VIEW PAIR
            </button>
            <button
              type="button"
              className="shopButton shoeAddButton"
              aria-label={`Add+: open details for ${name}`}
              onClick={handleAdd}
            >
              Add+
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="shopButton"
            aria-label={`View ${name}`}
            onClick={handleViewPair}
          >
            VIEW PAIR
          </button>
        )}
      </div>
    </article>
  );
}
