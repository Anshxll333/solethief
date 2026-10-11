import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProductDetails from '../components/ProductDetails';
import ProductGallery from '../components/ProductGallery';
import { useCommerce } from '../commerce/context.js';
import { CatalogState } from '../commerce/CommerceUI';
import { parseProductId } from '../commerce/catalog.js';

export default function Product({ imagesOnly = false }) {
  const { id } = useParams();
  const { catalog } = useCommerce();
  const productId = parseProductId(id);
  const shoe = catalog.products.find(product => product.id === productId);
  useEffect(() => { window.scrollTo(0, 0); }, [id, imagesOnly]);

  return <div className="pageContainer"><Navbar />
    {productId === null || (catalog.status === 'ready' && !shoe) ? <main className="commercePage commerceState"><h1>Pair not found.</h1><p>This link is invalid, or the pair is no longer listed in the archive.</p><Link className="commerceButton" to="/shop">Explore available listings</Link></main>
      : catalog.status !== 'ready' ? <main className="commercePage"><h1>The archive</h1><CatalogState /><Link className="commerceTextLink" to="/shop">Back to shop</Link></main>
        : imagesOnly ? <ProductGallery key={shoe.id} shoe={shoe} />
          : <ProductDetails key={shoe.id} shoe={shoe} />}
    <Footer /></div>;
}
