import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import TransparentArtwork from '../components/TransparentArtwork';
import { useCommerce } from '../commerce/context.js';
import { CatalogCard, CatalogState } from '../commerce/CommerceUI';
import { shopCategoriesService, subscribeShopUpdates } from '../services/shopCategories.js';
import { readPreviewShopCategories } from '../commerce/shopCategories.js';
import { resolveCategorySelection, shopGroupLocation, resolveCollectionArtwork } from './shopGroups.js';
import './Shop.css';

export default function Shop() {
  const { catalog } = useCommerce();
  const [searchParams] = useSearchParams();
  const selectedSlug = searchParams.get('group');
  const [directory, setDirectory] = useState({
    status: 'loading',
    categories: [],
    memberships: [],
    source: null,
  });
  const heading = useRef(null);
  const previousSlug = useRef(selectedSlug);
  const [failedImages, setFailedImages] = useState({});

  const handleArtworkError = (imageUrl) => {
    if (!imageUrl) return;
    setFailedImages((prev) => ({ ...prev, [imageUrl]: true }));
  };

  useEffect(() => {
    let active = true;
    const loadCategories = () => {
      shopCategoriesService.list().then(data => {
        if (active) {
          setDirectory({
            status: 'ready',
            categories: data.categories,
            memberships: data.memberships,
            source: data.source,
          });
        }
      }).catch(() => {
        if (active) {
          setDirectory({
            status: 'error',
            categories: [],
            memberships: [],
            source: null,
          });
        }
      });
    };

    loadCategories();
    const unsubscribe = subscribeShopUpdates(loadCategories);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (previousSlug.current !== selectedSlug) {
      heading.current?.focus({ preventScroll: true });
      previousSlug.current = selectedSlug;
    }
  }, [selectedSlug]);

  let hiddenCategories = [];
  if (directory.source === 'preview') {
    try {
      const store = readPreviewShopCategories();
      hiddenCategories = (store?.categories || []).filter(c => c && c.is_visible === false);
    } catch {
      // preview storage unavailable or error
    }
  }

  const selection = resolveCategorySelection({
    categories: directory.categories,
    memberships: directory.memberships,
    products: catalog.products || [],
    slug: selectedSlug,
    hiddenCategories,
  });

  return <div className="pageContainer">
    <Navbar />
    <main className="shopPage">
      <h1 className="shopIntro" ref={heading} tabIndex={-1}>Find your next pair.</h1>
      {selectedSlug !== null && <Link className="shopBack" to={shopGroupLocation(searchParams)}>
        <ArrowLeft size={18} aria-hidden="true" /> All collections
      </Link>}

      {selectedSlug !== null ? (
        directory.status === 'loading' ? (
          <p className="commerceState" role="status">Loading collections...</p>
        ) : directory.status === 'error' ? (
          <div className="shopEmpty" role="status">
            <h2>Collections unavailable.</h2>
            <p>Could not load collections. Return to all collections to browse.</p>
          </div>
        ) : selection.state === 'hidden' ? (
          <div className="shopEmpty" role="status">
            <h2>Collection hidden.</h2>
            <p>This collection is currently hidden and not available for browsing.</p>
          </div>
        ) : selection.state === 'unavailable' ? (
          <div className="shopEmpty" role="status">
            <h2>Collection unavailable.</h2>
            <p>This collection has no listed pairs or is no longer available. Return to all collections to browse.</p>
          </div>
        ) : (
          <section aria-labelledby="shop-collection-title">
            <h2 className="shopCollectionTitle" id="shop-collection-title">{selection.category?.name}</h2>
            {catalog.status === 'loading' && <CatalogState />}
            {catalog.status === 'error' && <CatalogState />}
            {catalog.status === 'ready' && (
              selection.state === 'empty' ? (
                <div className="shopEmpty" role="status">
                  <h2>No pairs currently listed.</h2>
                  <p>This collection has no listed pairs right now. Check back for the next drop.</p>
                </div>
              ) : (
                <div className="shopProducts">
                  {selection.products.map(product => (
                    <CatalogCard key={product.id} product={product} />
                  ))}
                </div>
              )
            )}
          </section>
        )
      ) : directory.status === 'loading' ? (
        <p className="commerceState" role="status">Loading collections...</p>
      ) : directory.status === 'error' ? (
        <div className="shopEmpty" role="status">
          <h2>Collections unavailable.</h2>
          <p>Could not load collections. Check your connection or configuration and try again.</p>
        </div>
      ) : directory.categories.length > 0 ? (
        <ul className="shopGroups" aria-label="Shoe collections">
          {directory.categories.map(category => {
            const artworkSrc = resolveCollectionArtwork(category);
            const hasArtwork = Boolean(artworkSrc) && !failedImages[artworkSrc];
            return (
              <li key={category.id}>
                <Link
                  className={`shopGroupTile ${hasArtwork ? 'hasArtwork' : ''}`}
                  data-group={category.slug}
                  to={shopGroupLocation(searchParams, category.slug)}
                  aria-label={`Shop ${category.name} collection`}
                >
                  <div
                    className={`shopGroupArch ${hasArtwork ? 'hasArtwork' : ''}`}
                    aria-hidden="true"
                  >
                    {hasArtwork ? (
                      <TransparentArtwork
                        className="shopGroupArtwork"
                        src={artworkSrc}
                        alt=""
                        loading="lazy"
                        onError={() => handleArtworkError(artworkSrc)}
                      />
                    ) : null}
                  </div>
                  <h2 className="shopGroupLabel">{category.name}</h2>
                  <span className="shopGroupAction">
                    SHOP NOW <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="shopEmpty" role="status">
          <h2>No collections are currently listed.</h2>
          <p>Check back for the next drop.</p>
        </div>
      )}
    </main>
    <Footer />
  </div>;
}
