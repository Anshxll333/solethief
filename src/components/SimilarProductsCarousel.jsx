import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import TransparentArtwork from './TransparentArtwork';

export default function SimilarProductsCarousel({ products = [] }) {
  const scrollRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const checkScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // Allow 2px tolerance for fractional scrolling
    setCanScrollPrev(scrollLeft > 4);
    setCanScrollNext(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollState();
    el.addEventListener('scroll', checkScrollState, { passive: true });
    window.addEventListener('resize', checkScrollState);
    return () => {
      el.removeEventListener('scroll', checkScrollState);
      window.removeEventListener('resize', checkScrollState);
    };
  }, [checkScrollState, products]);

  const scrollByOneItem = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by roughly one card width + gap (approx 25-33% of viewport container)
    const firstChild = el.querySelector('.similarCarouselItem');
    const itemWidth = firstChild ? firstChild.getBoundingClientRect().width + 40 : el.clientWidth * 0.28;
    el.scrollBy({
      left: direction === 'left' ? -itemWidth : itemWidth,
      behavior: 'smooth',
    });
  };

  if (!products || products.length === 0) return null;

  return (
    <section className="similarSection" aria-labelledby="similar-heading">
      {/* Top Header Row */}
      <div className="similarHeader">
        <div className="similarHeaderTitles">
          <span className="similarEyebrow">CURATED SOLE</span>
          <h2 id="similar-heading" className="similarHeading">
            SIMILAR SILHOUETTES
          </h2>
        </div>
        <Link to="/shop" className="similarViewAllLink">
          <span>MORE HEAT</span>
          <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {/* Carousel Viewport Container with Outside Floating Prev/Next Buttons */}
      <div className="similarCarouselWrapper">
        {/* Previous Button (Hidden/Disabled at start) */}
        <button
          type="button"
          className={`similarCarouselArrow similarCarouselPrev ${!canScrollPrev ? 'isHidden' : ''}`}
          onClick={() => scrollByOneItem('left')}
          disabled={!canScrollPrev}
          aria-label="Previous silhouettes"
        >
          <ChevronLeft size={22} strokeWidth={1.5} color="#1A1A1A" aria-hidden="true" />
        </button>

        {/* Carousel Scroll Track */}
        <div
          ref={scrollRef}
          className="similarCarouselTrack"
          role="region"
          aria-label="Similar silhouettes carousel"
          tabIndex={0}
        >
          {products.map((item) => {
            const formattedPrice = item.priceMinor
              ? '₹' + (item.priceMinor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : typeof item.price === 'number'
                ? '₹' + item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : String(item.price || '0').startsWith('₹')
                  ? item.price
                  : `₹${item.price || '0.00'}`;

            const brandCleaned = (item.brand || 'SOLETHIEF')
              .replace(/^SOLETHIEF\s*[-·•/]?\s*/i, '')
              .trim();

            const fallbackImg = item.frontImage || item.image || '/shoes/transparent/shoe-1-front.png';

            return (
              <Link
                key={item.id}
                to={`/product/${item.id}`}
                className="similarCarouselItem"
                aria-label={`${item.name} by ${brandCleaned || 'SOLETHIEF'}, ${formattedPrice}`}
              >
                {/* Floating Shoe Image directly on cream bg */}
                <div className="similarItemImageStage">
                  <TransparentArtwork
                    src={item.frontImage || fallbackImg}
                    alt={item.name}
                    className="similarItemShoeImg"
                    fallback={<img src={fallbackImg} alt={item.name} className="similarItemShoeImg" />}
                  />
                </div>

                {/* Typography Rows */}
                <div className="similarItemDetails">
                  <h3 className="similarItemName">{item.name}</h3>
                  <div className="similarItemMeta">
                    <span className="similarItemBrand">{brandCleaned || 'SOLETHIEF'}</span>
                    <span className="similarItemPrice">{formattedPrice}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Next Button (Hidden/Disabled at end) */}
        <button
          type="button"
          className={`similarCarouselArrow similarCarouselNext ${!canScrollNext ? 'isHidden' : ''}`}
          onClick={() => scrollByOneItem('right')}
          disabled={!canScrollNext}
          aria-label="Next silhouettes"
        >
          <ChevronRight size={22} strokeWidth={1.5} color="#1A1A1A" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
