import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Plus, Heart } from 'lucide-react';
import { AddToBag } from '../commerce/CommerceUI';
import { useWishlist } from '../commerce/wishlistContext.js';

export default function ProductDetails({ shoe }) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const inWishlist = isInWishlist(shoe.id);
  const images = [
    { src: shoe.frontImage, label: 'Front view' },
    { src: shoe.sideImage, label: 'Side view' },
  ].filter(image => image.src);
  const [activeImage, setActiveImage] = useState(0);

  return (
    <main className="pairDetails">
      <nav className="pairBreadcrumb" aria-label="Breadcrumb">
        <Link to="/shop"><ArrowLeft size={15} aria-hidden="true" /> Back to the archive</Link>
        <span aria-current="page">{shoe.name}</span>
      </nav>

      <div className="pairLayout">
        <section className="pairGallery" aria-label={`${shoe.name} image gallery`}>
          <div className="pairImageStage">
            <span className="pairImageLabel">THE ARCHIVE / {String(shoe.id).padStart(2, '0')}</span>
            <img src={images[activeImage].src} alt={`${shoe.name} - ${images[activeImage].label}`} className="pairMainImage" />
            <span className="pairImageCounter" aria-live="polite">0{activeImage + 1} / 0{images.length} &mdash; {images[activeImage].label}</span>
          </div>
          <div className="pairThumbnails" role="group" aria-label="Choose shoe view">
            {images.map((image, index) => (
              <button type="button" key={image.src} className="pairThumbnail" aria-pressed={activeImage === index} aria-label={`Show ${image.label.toLowerCase()}`} onClick={() => setActiveImage(index)}>
                <img src={image.src} alt="" />
                <span>{image.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pairInfo" aria-labelledby="pair-title">
          <p className="pairEyebrow">{shoe.brand}</p>
          <h1 id="pair-title" className="pairTitle">{shoe.name}</h1>
          <p className="pairPrice">&#8377;{shoe.price}</p>

          <div className="pairSizeBlock">
            <div className="pairSectionLabel">LISTED SIZE <span>US sizing</span></div>
            <span className="pairSizeValue">{shoe.size}</span>
            <p>This is the size listed for this pair. Fit details are pending confirmation.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '1rem 0' }}>
            <AddToBag product={shoe} />
            <button
              type="button"
              className={`productWishlistBtn ${inWishlist ? 'isInWishlist' : ''}`}
              aria-label={inWishlist ? `Remove ${shoe.name} from wishlist` : `Save ${shoe.name} to wishlist`}
              aria-pressed={inWishlist}
              onClick={() => toggleWishlist(shoe.id)}
            >
              <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} aria-hidden="true" />
              <span>{inWishlist ? 'Saved in Wishlist' : 'Save to Wishlist'}</span>
            </button>
          </div>

          <div className="pairAccordions">
            <details className="pairAccordion" open>
              <summary>Description <Plus size={18} aria-hidden="true" /></summary>
              <div className="pairAccordionBody">
                <p>Explore {shoe.name} from {shoe.brand} in the front and side views shown here.</p>
                <p>Full product description and condition details are pending confirmation.</p>
              </div>
            </details>
            <details className="pairAccordion">
              <summary>Materials & care <Plus size={18} aria-hidden="true" /></summary>
              <div className="pairAccordionBody">
                <dl className="pairSpecs">
                  <div><dt>Upper material</dt><dd>Pending confirmation</dd></div>
                  <div><dt>Sole material</dt><dd>Pending confirmation</dd></div>
                  <div><dt>Care instructions</dt><dd>Pending confirmation</dd></div>
                </dl>
                <p>Verified material and care information will be added before purchasing is enabled.</p>
              </div>
            </details>
          </div>

          <Link className="pairArchiveLink" to="/shop">Explore the rest of the drop <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </section>
      </div>
    </main>
  );
}
