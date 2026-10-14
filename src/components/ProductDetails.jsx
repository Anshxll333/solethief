import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Minus,
  Heart,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Truck,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import TransparentArtwork from './TransparentArtwork';
import SimilarProductsCarousel from './SimilarProductsCarousel';
import { normalizeShoeAssetPath } from '../services/transparentArtwork.js';
import { shoesData } from '../data/shoes.js';
import { useCommerce } from '../commerce/context.js';
import { useWishlist } from '../commerce/wishlistContext.js';
import { canAddPair, MAX_PAIRS } from '../commerce/cart.js';

export default function ProductDetails({ shoe }) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const inWishlist = Boolean(shoe && isInWishlist(shoe.id));

  const { catalog, cart, add, storageWarning } = useCommerce();
  const [justAdded, setJustAdded] = useState(false);
  const [prevShoeId, setPrevShoeId] = useState(shoe?.id);
  if (shoe?.id !== prevShoeId) {
    setPrevShoeId(shoe?.id);
    setJustAdded(false);
  }

  // Accordion open/close states
  const [openDescription, setOpenDescription] = useState(false);
  const [openMaterials, setOpenMaterials] = useState(false);

  const allShoes = (catalog.status === 'ready' && catalog.products?.length)
    ? catalog.products
    : shoesData;

  const similarShoes = useMemo(() => {
    if (!shoe || !allShoes?.length) return [];
    const others = allShoes.filter((s) => String(s.id) !== String(shoe.id));
    const sameBrand = others.filter(
      (s) => s.brand && shoe.brand && s.brand.toLowerCase() === shoe.brand.toLowerCase()
    );
    const remaining = others.filter(
      (s) => !s.brand || !shoe.brand || s.brand.toLowerCase() !== shoe.brand.toLowerCase()
    );
    return [...sameBrand, ...remaining];
  }, [shoe, allShoes]);

  // Safe image fallbacks to ensure side view never renders empty or broken
  const fallbackMain = normalizeShoeAssetPath(shoe?.frontImage || shoe?.image || '/shoes/transparent/shoe-1-front.png');
  const fallbackSide = normalizeShoeAssetPath(shoe?.sideImage) || fallbackMain;

  const additionalList = shoe?.additionalImages
    ? (typeof shoe.additionalImages === 'string'
      ? shoe.additionalImages.split('\n').map((s) => s.trim()).filter(Boolean)
      : shoe.additionalImages)
    : [];

  let rawImages = [];
  if (Array.isArray(shoe?.images) && shoe.images.length > 0) {
    rawImages = shoe.images;
  } else {
    rawImages = [shoe?.frontImage || fallbackMain, shoe?.sideImage || fallbackSide, ...additionalList];
  }

  const normalizedImages = rawImages
    .map(normalizeShoeAssetPath)
    .filter(Boolean);

  if (normalizedImages.length === 1) {
    normalizedImages.push(fallbackSide);
  }

  const displayImages = normalizedImages.map((src, index) => {
    return { src, label: `Image ${index + 1}` };
  });

  const [activeImage, setActiveImage] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const currentImg = displayImages[activeImage] || displayImages[0] || { src: fallbackMain, label: 'Image 1' };

  // Keyboard navigation for fullscreen zoom modal
  useEffect(() => {
    if (!isZoomOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsZoomOpen(false);
      if (e.key === 'ArrowLeft') {
        setActiveImage((prev) => (prev > 0 ? prev - 1 : displayImages.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setActiveImage((prev) => (prev < displayImages.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomOpen, displayImages.length]);

  const handlePrevImage = (e) => {
    e?.stopPropagation?.();
    setActiveImage((prev) => (prev > 0 ? prev - 1 : displayImages.length - 1));
  };

  const handleNextImage = (e) => {
    e?.stopPropagation?.();
    setActiveImage((prev) => (prev < displayImages.length - 1 ? prev + 1 : 0));
  };

  // Normalized US sizing options
  const defaultSizes = [
    { value: 'US 7', quantity: 10, sold: false },
    { value: 'US 7.5', quantity: 10, sold: false },
    { value: 'US 8', quantity: 10, sold: false },
    { value: 'US 8.5', quantity: 10, sold: false },
    { value: 'US 9', quantity: 10, sold: false },
    { value: 'US 9.5', quantity: 10, sold: false },
    { value: 'US 10', quantity: 10, sold: false },
    { value: 'US 10.5', quantity: 10, sold: false },
    { value: 'US 11', quantity: 10, sold: false },
  ];

  const rawSizes = shoe?.sizes?.length
    ? shoe.sizes
    : shoe?.size
      ? [{ value: shoe.size, quantity: 10, sold: false }]
      : defaultSizes;

  const sizes = useMemo(() => {
    return rawSizes.map((s) => {
      if (typeof s === 'string') return { value: s, quantity: 10, sold: false };
      const qty = typeof s.quantity === 'number' ? s.quantity : 10;
      const sold = Boolean(s.sold || qty <= 0);
      return {
        ...s,
        quantity: Math.max(0, qty),
        sold,
      };
    });
  }, [rawSizes]);

  const firstAvailableSize = useMemo(() => {
    return sizes.find((s) => !s.sold && s.quantity > 0)?.value || null;
  }, [sizes]);

  const [selectedSize, setSelectedSize] = useState(() => firstAvailableSize);

  // Sync selected size if current selection is invalid, out of stock, or quantity hit zero
  useEffect(() => {
    const currentVariant = sizes.find((s) => s.value === selectedSize);
    if (!selectedSize || !currentVariant || currentVariant.sold || currentVariant.quantity <= 0) {
      setSelectedSize(firstAvailableSize);
    }
  }, [shoe?.id, sizes, selectedSize, firstAvailableSize]);

  const selectedVariant = sizes.find((s) => s.value === selectedSize);
  const isSelectedSoldOut = !selectedSize || !selectedVariant || selectedVariant.sold || selectedVariant.quantity <= 0;
  const allSizesSoldOut = sizes.every((s) => s.sold || s.quantity <= 0);

  // Quantity selector bounds based on available stock of the chosen size (capped at 10)
  const availableStock = selectedVariant && !selectedVariant.sold ? Math.max(0, selectedVariant.quantity) : 0;
  const maxAvailable = Math.min(10, availableStock);
  const [quantity, setQuantity] = useState(() => (availableStock > 0 ? 1 : 0));

  useEffect(() => {
    if (availableStock <= 0) {
      setQuantity(0);
    } else if (quantity <= 0) {
      setQuantity(1);
    } else if (quantity > maxAvailable) {
      setQuantity(maxAvailable);
    }
  }, [availableStock, maxAvailable, quantity]);

  const existingSizeQuantity = cart.items?.find(
    (item) => String(item.id) === String(shoe?.id) && (item.size === selectedSize || (!item.size && !selectedSize))
  )?.quantity || (cart.quantities?.[shoe?.id] || 0);

  const full = cart.source === catalog.source && cart.ids.length >= MAX_PAIRS;
  const enabled = (catalog.status === 'ready' && canAddPair(shoe, catalog.source))
    || canAddPair(shoe, 'preview')
    || Boolean(shoe && (shoe.priceMinor || shoe.price));

  const handleActionClick = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (full || !shoe || isSelectedSoldOut || !selectedSize || availableStock <= 0) return;
    const numericId = Number(shoe?.id);
    const targetId = Number.isInteger(numericId) && numericId > 0 ? numericId : shoe?.id;
    add(targetId, Math.min(quantity, availableStock), selectedSize);
    setJustAdded(true);
  };

  if (!shoe) return null;

  // Price formatting
  const formattedPrice = shoe.priceMinor
    ? '₹' + (shoe.priceMinor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : typeof shoe.price === 'number'
      ? '₹' + shoe.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(shoe.price || '0').startsWith('₹')
        ? shoe.price
        : `₹${shoe.price || '0.00'}`;

  const comparePrice = shoe.comparePriceMinor
    ? '₹' + (shoe.comparePriceMinor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : shoe.originalPrice || null;

  const rawBrand = (shoe.brand || '').trim();
  const cleanedSubBrand = rawBrand.replace(/^SOLETHIEF\s*[-·•/]?\s*/i, '').trim();
  const brandBadgeText = cleanedSubBrand
    ? `SOLETHIEF · ${cleanedSubBrand.toUpperCase()}`
    : (rawBrand ? rawBrand.toUpperCase() : 'SOLETHIEF ARCHIVE');
  const categoryOrBrand = (cleanedSubBrand || shoe.category || rawBrand || 'ARCHIVE').toUpperCase();

  const richDescriptionCopy =
    "SoleThief Tokyo vault edition authenticated pair. Inspired by classic Japanese street style, this silhouette blends vintage aesthetics with everyday wearability. A rare archive find, carefully sourced and preserved for its timeless design and comfort.";

  return (
    <main className="pairDetails">
      {/* Top Editorial Breadcrumb */}
      <nav className="pairBreadcrumb" aria-label="Breadcrumb">
        <div className="pairBreadcrumbLeft">
          <Link to="/shop" className="pairBreadcrumbBack">
            <ArrowLeft size={14} aria-hidden="true" /> BACK TO THE ARCHIVE
          </Link>
          <span className="pairBreadcrumbDivider">/</span>
          <Link to="/" className="pairBreadcrumbLink">HOME</Link>
          <span className="pairBreadcrumbDivider">/</span>
          <Link to="/shop" className="pairBreadcrumbLink">ARCHIVE</Link>
          <span className="pairBreadcrumbDivider">/</span>
          <span className="pairBreadcrumbCurrent">{categoryOrBrand}</span>
        </div>
        <div className="pairBreadcrumbRight">
          <span className="pairBreadcrumbShoeName">{shoe.name}</span>
        </div>
      </nav>

      {/* Main 2-Column Responsive Layout (55% / 45%) */}
      <div className="pairLayout">
        {/* LEFT COLUMN: Gallery */}
        <section className="pairGallery" aria-label={`${shoe.name} image gallery`}>
          {/* Main Image in 12px rounded card with soft beige bg #EAE3D3 */}
          <div className="pairImageStage">
            <button
              type="button"
              className="pairGalleryExpandBtn"
              onClick={() => setIsZoomOpen(true)}
              aria-label="View full size image"
              title="Expand preview"
            >
              <Maximize2 size={16} strokeWidth={1.5} aria-hidden="true" />
            </button>

            {displayImages.length > 1 && (
              <button
                type="button"
                className="pairGalleryArrow pairGalleryArrowLeft"
                onClick={handlePrevImage}
                aria-label="Previous image"
              >
                <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}

            <div className="pairMainImageWrapper">
              <TransparentArtwork
                src={currentImg.src}
                alt={`${shoe.name} - ${currentImg.label}`}
                className="pairMainImage"
                fallback={<img src={fallbackMain} alt={shoe.name} className="pairMainImage" />}
              />
            </div>

            {displayImages.length > 1 && (
              <button
                type="button"
                className="pairGalleryArrow pairGalleryArrowRight"
                onClick={handleNextImage}
                aria-label="Next image"
              >
                <ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Bottom row: Thumbnails at bottom-left in neat rounded preview tiles + Pagination text */}
          <div className="pairGalleryFooter">
            <div className="pairThumbnails" role="group" aria-label="Choose shoe view">
              {displayImages.map((image, index) => {
                const isActive = activeImage === index;
                return (
                  <button
                    type="button"
                    key={image.src + index}
                    className={`pairThumbnail ${isActive ? 'isActive' : ''}`}
                    aria-pressed={isActive}
                    aria-label={`View ${index + 1}`}
                    onClick={() => setActiveImage(index)}
                  >
                    <div className="pairThumbnailImgWrap">
                      <TransparentArtwork
                        src={image.src || fallbackMain}
                        alt=""
                        onError={(e) => {
                          if (e?.currentTarget && e.currentTarget.src !== fallbackMain) {
                            e.currentTarget.src = fallbackMain;
                          }
                        }}
                        fallback={<img src={fallbackMain} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Info Panel */}
        <section className="pairInfo" aria-labelledby="pair-title">
          {/* Brand Tag */}
          <div className="pairBrandBadgeRow">
            <span className="pairBrandLabel">{brandBadgeText}</span>
          </div>

          {/* Title Row with Monochrome Wishlist Heart */}
          <div className="pairTitleRow">
            <h1 id="pair-title" className="pairTitle">
              {shoe.name}
            </h1>
            <button
              type="button"
              className={`pairInlineWishlistBtn ${inWishlist ? 'isWishlisted' : ''}`}
              aria-label={inWishlist ? `Remove ${shoe.name} from wishlist` : `Add ${shoe.name} to wishlist`}
              aria-pressed={inWishlist}
              onClick={() => toggleWishlist(shoe.id)}
              title={inWishlist ? 'In your wishlist' : 'Add to wishlist'}
            >
              <Heart
                size={22}
                fill={inWishlist ? '#1A1A1A' : 'none'}
                color="#1A1A1A"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Price Display */}
          <div className="pairPriceRow">
            <span className="pairPrice">{formattedPrice}</span>
            {comparePrice && <span className="pairComparePrice">{comparePrice}</span>}
          </div>

          {/* Available Sizes Section */}
          <div className="pairSizeBlock">
            <div className="pairSizeHeader">
              <span className="pairSizeHeaderLabel">AVAILABLE SIZES</span>
              <span className="pairSizeSubLabel">US sizing</span>
            </div>
            <div className="pairSizeOptions" role="radiogroup" aria-label="Available shoe sizes">
              {sizes.map((size) => {
                const isSoldOut = Boolean(size.sold || size.quantity <= 0);
                const isSelected = !isSoldOut && selectedSize === size.value;
                return (
                  <button
                    type="button"
                    key={size.value}
                    className={`pairSizePill ${isSelected ? 'isSelected' : ''} ${isSoldOut ? 'isSoldOut' : ''}`}
                    disabled={isSoldOut}
                    aria-disabled={isSoldOut}
                    tabIndex={isSoldOut ? -1 : 0}
                    onClick={() => {
                      if (!isSoldOut) {
                        setSelectedSize(size.value);
                        setQuantity(1);
                        setJustAdded(false);
                      }
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    title={
                      isSoldOut
                        ? `${size.value} - Out of stock`
                        : `${size.quantity} ${size.quantity === 1 ? 'pair' : 'pairs'} available`
                    }
                  >
                    <span className="pairSizeValue">{size.value}</span>
                    {isSoldOut && <span className="pairSizeStockLabel">OUT OF STOCK</span>}
                  </button>
                );
              })}
            </div>
            <p className="pairSizeNotice">
              Sizes are disabled automatically when quantity reaches zero. Sold-out sizes are manually disabled by the store operator.
            </p>
          </div>

          {/* Side-by-Side Controls: Quantity Box + Add to Bag Button */}
          <div className="pairPurchaseControlsRow">
            {/* Quantity Selector: [ − ] [ 1 ] [ + ] */}
            <div className="pairQuantityBox" aria-label="Quantity selector">
              <button
                type="button"
                className="pairQuantityBtn"
                onClick={() => {
                  setQuantity((q) => Math.max(1, q - 1));
                  setJustAdded(false);
                }}
                disabled={quantity <= 1 || isSelectedSoldOut || availableStock <= 0}
                aria-label="Decrease quantity"
              >
                <Minus size={15} strokeWidth={1.5} aria-hidden="true" />
              </button>
              <span className="pairQuantityValue" aria-live="polite">
                {isSelectedSoldOut ? 0 : quantity}
              </span>
              <button
                type="button"
                className="pairQuantityBtn"
                onClick={() => {
                  setQuantity((q) => Math.min(maxAvailable, q + 1));
                  setJustAdded(false);
                }}
                disabled={quantity >= maxAvailable || isSelectedSoldOut || availableStock <= 0}
                aria-label="Increase quantity"
              >
                <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Dark Primary Action Button */}
            <button
              type="button"
              className={`pairAddToBagBtn ${justAdded ? 'isJustAdded' : ''} ${isSelectedSoldOut ? 'isSoldOut' : ''}`}
              disabled={!enabled || full || isSelectedSoldOut || availableStock <= 0}
              onClick={handleActionClick}
              aria-label={
                isSelectedSoldOut || allSizesSoldOut
                  ? `${shoe.name} is out of stock`
                  : !enabled
                    ? 'Availability unverified'
                    : full
                      ? 'Bag limit reached'
                      : `Add to bag: ${shoe.name}, ${selectedSize}`
              }
            >
              {justAdded ? (
                <>
                  ADDED TO BAG ✓
                </>
              ) : isSelectedSoldOut || allSizesSoldOut ? (
                'OUT OF STOCK'
              ) : full ? (
                'BAG LIMIT REACHED'
              ) : (
                `ADD TO BAG (${selectedSize})`
              )}
            </button>
          </div>

          {justAdded && (
            <div className="pairBagFeedbackRow" role="status">
              <div className="pairBagFeedbackLeft">
                <span className="pairBagFeedbackCheck" aria-hidden="true">✓</span>
                <span className="pairBagFeedbackText">
                  <strong>{selectedSize}</strong> is in your bag ({existingSizeQuantity || quantity} {(existingSizeQuantity || quantity) === 1 ? 'pair' : 'pairs'}).
                </span>
              </div>
              <div className="pairBagFeedbackRight">
                <Link to="/cart" className="pairBagFeedbackLink">
                  VIEW BAG →
                </Link>
                <button
                  type="button"
                  className="pairBagFeedbackDismiss"
                  onClick={() => setJustAdded(false)}
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {storageWarning && <span className="pairStorageWarning">{storageWarning}</span>}

          {/* Trust Badges */}
          <div className="pairTrustBadges">
            <div className="pairTrustItem">
              <div className="pairTrustIconWrap">
                <Truck size={18} strokeWidth={1.5} className="pairTrustIcon" aria-hidden="true" />
              </div>
              <div className="pairTrustText">
                <span className="pairTrustTitle">Quality Checked</span>
                <span className="pairTrustDesc">Authentic & verified</span>
              </div>
            </div>
            <div className="pairTrustItem">
              <div className="pairTrustIconWrap">
                <RotateCcw size={18} strokeWidth={1.5} className="pairTrustIcon" aria-hidden="true" />
              </div>
              <div className="pairTrustText">
                <span className="pairTrustTitle">3 Days Replacement</span>
                <span className="pairTrustDesc">Hassle-free size exchange</span>
              </div>
            </div>
            <div className="pairTrustItem">
              <div className="pairTrustIconWrap">
                <ShieldCheck size={18} strokeWidth={1.5} className="pairTrustIcon" aria-hidden="true" />
              </div>
              <div className="pairTrustText">
                <span className="pairTrustTitle">Thrifted & Sustainable</span>
                <span className="pairTrustDesc">Give sneakers a second life</span>
              </div>
            </div>
          </div>

          {/* Expandable Accordions: DESCRIPTION, MATERIALS & CARE */}
          <div className="pairAccordionsList">
            {/* Description Accordion */}
            <div className="pairAccordion">
              <button
                type="button"
                className="pairAccordionHeader"
                onClick={() => setOpenDescription(!openDescription)}
                aria-expanded={openDescription}
              >
                <span className="pairAccordionTitle">DESCRIPTION</span>
                <span className="pairAccordionIcon">
                  {openDescription ? (
                    <Minus size={18} strokeWidth={1.75} color="currentColor" aria-hidden="true" />
                  ) : (
                    <Plus size={18} strokeWidth={1.75} color="currentColor" aria-hidden="true" />
                  )}
                </span>
              </button>
              <div
                className={`pairAccordionCollapse ${openDescription ? 'isOpen' : ''}`}
                style={!openDescription ? { display: 'none', height: 0, overflow: 'hidden' } : undefined}
                aria-hidden={!openDescription}
              >
                <div className="pairAccordionContent">
                  <p>{richDescriptionCopy}</p>
                </div>
              </div>
            </div>

            {/* Materials & Care Accordion */}
            <div className="pairAccordion">
              <button
                type="button"
                className="pairAccordionHeader"
                onClick={() => setOpenMaterials(!openMaterials)}
                aria-expanded={openMaterials}
              >
                <span className="pairAccordionTitle">MATERIALS & CARE</span>
                <span className="pairAccordionIcon">
                  {openMaterials ? (
                    <Minus size={18} strokeWidth={1.75} color="currentColor" aria-hidden="true" />
                  ) : (
                    <Plus size={18} strokeWidth={1.75} color="currentColor" aria-hidden="true" />
                  )}
                </span>
              </button>
              <div
                className={`pairAccordionCollapse ${openMaterials ? 'isOpen' : ''}`}
                style={!openMaterials ? { display: 'none', height: 0, overflow: 'hidden' } : undefined}
                aria-hidden={!openMaterials}
              >
                <div className="pairAccordionContent">
                  <dl className="pairSpecs">
                    <div className="pairSpecRow">
                      <dt className="pairSpecKey">Upper Material</dt>
                      <dd className="pairSpecVal">{shoe.upperMaterial || 'Premium leather & mesh construction'}</dd>
                    </div>
                    <div className="pairSpecRow">
                      <dt className="pairSpecKey">Sole Material</dt>
                      <dd className="pairSpecVal">{shoe.soleMaterial || 'Vulcanized rubber traction outsole'}</dd>
                    </div>
                    <div className="pairSpecRow">
                      <dt className="pairSpecKey">Care Instructions</dt>
                      <dd className="pairSpecVal">{shoe.careInstructions || 'Wipe clean with cold damp cloth; air dry away from heat.'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Similar Silhouettes Section (Carousel) */}
      <SimilarProductsCarousel products={similarShoes} />

      {/* Fullscreen High-Res Image Overlay / Modal */}
      {isZoomOpen && (
        <div
          className="pairZoomModal"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image preview"
          onClick={() => setIsZoomOpen(false)}
        >
          <div className="pairZoomContent" onClick={(e) => e.stopPropagation()}>
            <div className="pairZoomHeader">
              <span className="pairZoomTitle">
                {shoe.name} &mdash; {currentImg.label.toUpperCase()}
              </span>
              <button
                type="button"
                className="pairZoomCloseBtn"
                onClick={() => setIsZoomOpen(false)}
                aria-label="Close fullscreen view"
              >
                <X size={24} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="pairZoomImageContainer">
              {displayImages.length > 1 && (
                <button
                  type="button"
                  className="pairZoomArrow pairZoomArrowLeft"
                  onClick={handlePrevImage}
                  aria-label="Previous image"
                >
                  <ChevronLeft size={32} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
              <TransparentArtwork
                src={currentImg.src}
                alt={`${shoe.name} - ${currentImg.label}`}
                className="pairZoomImage"
              />
              {displayImages.length > 1 && (
                <button
                  type="button"
                  className="pairZoomArrow pairZoomArrowRight"
                  onClick={handleNextImage}
                  aria-label="Next image"
                >
                  <ChevronRight size={32} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
