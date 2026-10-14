import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProductDetails from '../components/ProductDetails';
import ProductGallery from '../components/ProductGallery';
import { useCommerce } from '../commerce/context.js';
import { CatalogState } from '../commerce/CommerceUI';
import { parseProductId, parsePrice } from '../commerce/catalog.js';
import { shoesData } from '../data/shoes.js';

export default function Product({ imagesOnly = false }) {
  const { id } = useParams();
  const { catalog } = useCommerce();
  const rawId = String(id || '').split(':')[0].split('_')[0];
  const productId = parseProductId(rawId) ?? (Number(rawId) > 0 ? Number(rawId) : null);

  const fallbackShoeRaw = shoesData.find(s => s.id === productId || String(s.id) === String(rawId) || String(s.id) === String(id));
  const fallbackShoe = fallbackShoeRaw ? {
    ...fallbackShoeRaw,
    priceMinor: fallbackShoeRaw.priceMinor || (parsePrice(String(fallbackShoeRaw.price || '').replace(/[^\d.]/g, '')) || 1800000),
    currency: fallbackShoeRaw.currency || 'INR',
  } : null;

  const catalogShoe = catalog.products?.find(product => product.id === productId || String(product.id) === String(rawId) || String(product.id) === String(id));
  const shoe = catalogShoe || fallbackShoe;

  useEffect(() => { window.scrollTo(0, 0); }, [id, imagesOnly]);

  return (
    <div className="pageContainer">
      <Navbar />
      {!shoe && catalog.status === 'loading' ? (
        <main className="commercePage">
          <h1>The archive</h1>
          <CatalogState />
          <Link className="commerceTextLink" to="/shop">Back to shop</Link>
        </main>
      ) : !shoe ? (
        <main className="commercePage commerceState">
          <h1>Pair not found.</h1>
          <p>This link is invalid, or the pair is no longer listed in the archive.</p>
          <Link className="commerceButton" to="/shop">Explore available listings</Link>
        </main>
      ) : imagesOnly ? (
        <ProductGallery key={shoe.id} shoe={shoe} />
      ) : (
        <ProductDetails key={shoe.id} shoe={shoe} />
      )}
      <Footer />
    </div>
  );
}
